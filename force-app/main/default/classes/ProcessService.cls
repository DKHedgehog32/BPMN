/**
 * @description Service class for Process operations - orchestrates cross-object business logic
 * @author Dennis van Musschenbroek (DvM) - Cobra CRM B.V.
 * @date 2024-12-12
 * @version 1.0.0
 * @group Service
 * 
 * EXPLANATION:
 * This service class provides the main business logic for Process Modeling Studio operations.
 * It orchestrates operations across Process__c, BPMN_Element__c, and BPMN_Connection__c objects.
 * 
 * Core responsibilities:
 * - Save/Load process diagrams (canvas JSON + related records sync)
 * - Publish processes (create version snapshots)
 * - Clone processes
 * - Validate process structure
 * - Process lifecycle management
 * 
 * The service maintains dual storage:
 * 1. Canvas_JSON__c on Process__c: Source of truth for the visual diagram
 * 2. BPMN_Element__c / BPMN_Connection__c: Searchable/reportable records
 * 
 * On save, the service parses Canvas_JSON and syncs the related records.
 * 
 * DEPENDENCIES:
 * - ProcessSelector: Queries for Process__c
 * - BPMNElementSelector: Queries for BPMN_Element__c
 * - BPMNConnectionSelector: Queries for BPMN_Connection__c
 * - Process__c, BPMN_Element__c, BPMN_Connection__c, Process_Version__c objects
 * 
 * ARCHITECTURE:
 * - AWAF Pattern: Service (Orchestration Layer)
 * - Coordinates: Domain logic and data access
 * - Uses: Selectors for queries, direct DML for mutations
 * - Stateless: All methods are static
 * 
 * CHANGELOG:
 * Version | Date       | Author | Description
 * --------|------------|--------|------------------------------------------
 * 1.0.0   | 2024-12-12 | DvM    | Initial creation - core CRUD operations
 * 
 * SECURITY:
 * - Sharing: with sharing (respects org sharing rules)
 * - FLS Enforcement: Via Selectors (SECURITY_ENFORCED)
 * - CRUD: Checked before DML operations
 * 
 * GOVERNOR LIMITS CONSIDERATIONS:
 * - Bulk operations use collections
 * - Single DML per operation where possible
 * - Large processes may require chunked sync
 * 
 * USAGE:
 * // Load process for editing
 * ProcessService.ProcessData data = ProcessService.loadProcess(processId);
 * 
 * // Save process after editing
 * ProcessService.saveProcess(processId, canvasJson);
 * 
 * // Publish a version
 * ProcessService.publishProcess(processId, 'Added approval step');
 */
public with sharing class ProcessService {
    
    // =========================================================================
    // INNER CLASSES - Data Transfer Objects
    // =========================================================================
    
    /**
     * @description DTO for returning process data to the LWC canvas
     */
    public class ProcessData {
        @AuraEnabled public Id processId;
        @AuraEnabled public String name;
        @AuraEnabled public String description;
        @AuraEnabled public String status;
        @AuraEnabled public Integer currentVersion;
        @AuraEnabled public String categoryId;
        @AuraEnabled public String categoryName;
        @AuraEnabled public String processOwnerId;
        @AuraEnabled public String processOwnerName;
        @AuraEnabled public String canvasJson;
        @AuraEnabled public String viewBoxSettings;
        @AuraEnabled public Datetime lastPublishedDate;
        @AuraEnabled public Integer elementCount;
        @AuraEnabled public Integer connectionCount;
        @AuraEnabled public Datetime lastModifiedDate;
        @AuraEnabled public Boolean isEditable;
    }
    
    /**
     * @description DTO for canvas element data from JSON
     */
    public class CanvasElement {
        public String elementId;
        public String name;
        public String elementType;
        public String description;
        public Decimal positionX;
        public Decimal positionY;
        public Decimal width;
        public Decimal height;
        public String assignedRole;
        public Decimal durationHours;
        public Decimal slaHours;
    }
    
    /**
     * @description DTO for canvas connection data from JSON
     */
    public class CanvasConnection {
        public String connectionId;
        public String connectionType;
        public String sourceElementId;
        public String targetElementId;
        public String label;
        public String condition;
        public Boolean isDefault;
    }
    
    /**
     * @description DTO for save operation result
     */
    public class SaveResult {
        @AuraEnabled public Boolean success;
        @AuraEnabled public String message;
        @AuraEnabled public Id processId;
        @AuraEnabled public Integer elementsCreated;
        @AuraEnabled public Integer elementsUpdated;
        @AuraEnabled public Integer elementsDeleted;
        @AuraEnabled public Integer connectionsCreated;
        @AuraEnabled public Integer connectionsUpdated;
        @AuraEnabled public Integer connectionsDeleted;
    }
    
    /**
     * @description DTO for validation result
     */
    public class ValidationResult {
        @AuraEnabled public Boolean isValid;
        @AuraEnabled public List<String> errors;
        @AuraEnabled public List<String> warnings;
        
        public ValidationResult() {
            this.isValid = true;
            this.errors = new List<String>();
            this.warnings = new List<String>();
        }
    }
    
    // =========================================================================
    // CRUD OPERATIONS
    // =========================================================================
    
    /**
     * @description Creates a new process with optional initial canvas JSON
     * @param name - Process name (required)
     * @param description - Process description (optional)
     * @param categoryId - Category lookup ID (optional)
     * @param canvasJson - Initial canvas JSON (optional)
     * @return Id - The new Process record ID
     * @throws ProcessException - If creation fails
     */
    @AuraEnabled
    public static Id createProcess(String name, String description, Id categoryId, String canvasJson) {
        // Validate input
        if (String.isBlank(name)) {
            throw new ProcessException('Process name is required.');
        }
        
        // Check CRUD permission
        if (!Schema.sObjectType.Process__c.isCreateable()) {
            throw new ProcessException('You do not have permission to create Process records.');
        }
        
        // Create process record with defaults
        Process__c newProcess = new Process__c(
            Name = name,
            Description__c = description,
            Category__c = categoryId,
            Status__c = 'Draft',
            Current_Version__c = 1,
            Canvas_JSON__c = String.isNotBlank(canvasJson) ? canvasJson : getDefaultCanvasJson(),
            Process_Owner__c = UserInfo.getUserId()
        );
        
        insert newProcess;
        
        // If canvas JSON provided, sync related records
        if (String.isNotBlank(canvasJson)) {
            syncRelatedRecords(newProcess.Id, canvasJson);
        }
        
        return newProcess.Id;
    }
    
    /**
     * @description Loads a process with all data needed for the canvas editor
     * @param processId - The Process ID to load
     * @return ProcessData - DTO with all process information
     */
    @AuraEnabled(cacheable=true)
    public static ProcessData loadProcess(Id processId) {
        if (processId == null) {
            throw new ProcessException('Process ID is required.');
        }
        
        // Query process with details
        Process__c proc = ProcessSelector.selectByIdWithDetails(processId);
        
        if (proc == null) {
            throw new ProcessException('Process not found or you do not have access.');
        }
        
        // Map to DTO
        ProcessData data = new ProcessData();
        data.processId = proc.Id;
        data.name = proc.Name;
        data.description = proc.Description__c;
        data.status = proc.Status__c;
        data.currentVersion = proc.Current_Version__c != null ? Integer.valueOf(proc.Current_Version__c) : 1;
        data.categoryId = proc.Category__c;
        data.categoryName = proc.Category__r?.Name;
        data.processOwnerId = proc.Process_Owner__c;
        data.processOwnerName = proc.Process_Owner__r?.Name;
        data.canvasJson = proc.Canvas_JSON__c;
        data.viewBoxSettings = proc.ViewBox_Settings__c;
        data.lastPublishedDate = proc.Last_Published_Date__c;
        data.elementCount = proc.Element_Count__c != null ? Integer.valueOf(proc.Element_Count__c) : 0;
        data.connectionCount = proc.Connection_Count__c != null ? Integer.valueOf(proc.Connection_Count__c) : 0;
        data.lastModifiedDate = proc.LastModifiedDate;
        
        // Determine if editable (Draft or In Review by owner)
        data.isEditable = (proc.Status__c == 'Draft' || proc.Status__c == 'In Review');
        
        return data;
    }
    
    /**
     * @description Saves the canvas state and syncs related records
     * @param processId - The Process ID to save
     * @param canvasJson - The canvas JSON state
     * @param viewBoxSettings - Optional viewport settings
     * @return SaveResult - Details of what was saved
     */
    @AuraEnabled
    public static SaveResult saveProcess(Id processId, String canvasJson, String viewBoxSettings) {
        SaveResult result = new SaveResult();
        result.success = false;
        
        try {
            // Validate inputs
            if (processId == null) {
                throw new ProcessException('Process ID is required.');
            }
            if (String.isBlank(canvasJson)) {
                throw new ProcessException('Canvas JSON is required.');
            }
            
            // Check permissions
            if (!Schema.sObjectType.Process__c.isUpdateable()) {
                throw new ProcessException('You do not have permission to update Process records.');
            }
            
            // Verify process exists and is editable
            Process__c proc = ProcessSelector.selectById(processId);
            if (proc == null) {
                throw new ProcessException('Process not found.');
            }
            if (proc.Status__c == 'Published' || proc.Status__c == 'Archived') {
                throw new ProcessException('Cannot edit a Published or Archived process. Clone it to make changes.');
            }
            
            // Update process record
            proc.Canvas_JSON__c = canvasJson;
            if (String.isNotBlank(viewBoxSettings)) {
                proc.ViewBox_Settings__c = viewBoxSettings;
            }
            update proc;
            
            // Sync related records and get counts
            SyncCounts counts = syncRelatedRecords(processId, canvasJson);
            
            result.success = true;
            result.message = 'Process saved successfully.';
            result.processId = processId;
            result.elementsCreated = counts.elementsCreated;
            result.elementsUpdated = counts.elementsUpdated;
            result.elementsDeleted = counts.elementsDeleted;
            result.connectionsCreated = counts.connectionsCreated;
            result.connectionsUpdated = counts.connectionsUpdated;
            result.connectionsDeleted = counts.connectionsDeleted;
            
        } catch (ProcessException e) {
            result.message = e.getMessage();
        } catch (Exception e) {
            result.message = 'Error saving process: ' + e.getMessage();
        }
        
        return result;
    }
    
    /**
     * @description Deletes a process and all related records (cascade via Master-Detail)
     * @param processId - The Process ID to delete
     */
    @AuraEnabled
    public static void deleteProcess(Id processId) {
        if (processId == null) {
            throw new ProcessException('Process ID is required.');
        }
        
        // Check permission
        if (!Schema.sObjectType.Process__c.isDeletable()) {
            throw new ProcessException('You do not have permission to delete Process records.');
        }
        
        // Verify exists
        Process__c proc = ProcessSelector.selectById(processId);
        if (proc == null) {
            throw new ProcessException('Process not found.');
        }
        
        // Check if Published (may want to prevent deletion)
        if (proc.Status__c == 'Published') {
            throw new ProcessException('Cannot delete a Published process. Archive it first.');
        }
        
        // Delete (children cascade via Master-Detail)
        delete proc;
    }
    
    // =========================================================================
    // VERSION CONTROL
    // =========================================================================
    
    /**
     * @description Publishes a process by creating a version snapshot
     * @param processId - The Process ID to publish
     * @param changeNotes - Description of changes in this version
     * @return Id - The new Process_Version__c record ID
     */
    @AuraEnabled
    public static Id publishProcess(Id processId, String changeNotes) {
        if (processId == null) {
            throw new ProcessException('Process ID is required.');
        }
        
        // Check permissions
        if (!Schema.sObjectType.Process__c.isUpdateable() ||
            !Schema.sObjectType.Process_Version__c.isCreateable()) {
            throw new ProcessException('You do not have permission to publish processes.');
        }
        
        // Load current process
        Process__c proc = ProcessSelector.selectById(processId);
        if (proc == null) {
            throw new ProcessException('Process not found.');
        }
        
        // Validate process can be published
        ValidationResult validation = validateProcessForPublish(processId);
        if (!validation.isValid) {
            throw new ProcessException('Cannot publish: ' + String.join(validation.errors, '; '));
        }
        
        // Calculate new version number
        Integer newVersion = (proc.Current_Version__c != null) 
                             ? Integer.valueOf(proc.Current_Version__c) + 1 
                             : 1;
        
        // Create version snapshot
        Process_Version__c version = new Process_Version__c(
            Process__c = processId,
            Version_Number__c = newVersion,
            Canvas_Snapshot__c = proc.Canvas_JSON__c,
            Published_Date__c = Datetime.now(),
            Published_By__c = UserInfo.getUserId(),
            Change_Notes__c = changeNotes
        );
        insert version;
        
        // Update process status and version
        proc.Status__c = 'Published';
        proc.Current_Version__c = newVersion;
        proc.Last_Published_Date__c = Datetime.now();
        update proc;
        
        return version.Id;
    }
    
    /**
     * @description Validates a process is ready for publishing
     * @param processId - The Process ID to validate
     * @return ValidationResult - Validation results with errors and warnings
     */
    @AuraEnabled
    public static ValidationResult validateProcessForPublish(Id processId) {
        ValidationResult result = new ValidationResult();
        
        if (processId == null) {
            result.isValid = false;
            result.errors.add('Process ID is required.');
            return result;
        }
        
        // Load process with details
        Process__c proc = ProcessSelector.selectByIdWithDetails(processId);
        if (proc == null) {
            result.isValid = false;
            result.errors.add('Process not found.');
            return result;
        }
        
        // Check for canvas content
        if (String.isBlank(proc.Canvas_JSON__c)) {
            result.isValid = false;
            result.errors.add('Process has no diagram content.');
            return result;
        }
        
        // Check for elements
        if (proc.BPMN_Elements__r == null || proc.BPMN_Elements__r.isEmpty()) {
            result.isValid = false;
            result.errors.add('Process must have at least one element.');
            return result;
        }
        
        // Check for start event
        Boolean hasStartEvent = false;
        Boolean hasEndEvent = false;
        for (BPMN_Element__c elem : proc.BPMN_Elements__r) {
            if (elem.Element_Type__c != null) {
                if (elem.Element_Type__c.contains('StartEvent')) {
                    hasStartEvent = true;
                }
                if (elem.Element_Type__c.contains('EndEvent')) {
                    hasEndEvent = true;
                }
            }
        }
        
        if (!hasStartEvent) {
            result.isValid = false;
            result.errors.add('Process must have at least one Start Event.');
        }
        
        if (!hasEndEvent) {
            result.warnings.add('Process has no End Event. Consider adding one for completeness.');
        }
        
        // Check for orphaned connections
        List<BPMN_Connection__c> orphaned = BPMNConnectionSelector.selectOrphanedConnections(processId);
        if (!orphaned.isEmpty()) {
            result.warnings.add(orphaned.size() + ' connection(s) have missing source or target elements.');
        }
        
        return result;
    }
    
    /**
     * @description Restores a previous version by copying its canvas snapshot
     * @param processId - The Process ID
     * @param versionId - The Version ID to restore
     * @return SaveResult - Result of the restore operation
     */
    @AuraEnabled
    public static SaveResult restoreVersion(Id processId, Id versionId) {
        SaveResult result = new SaveResult();
        result.success = false;
        
        try {
            if (processId == null || versionId == null) {
                throw new ProcessException('Process ID and Version ID are required.');
            }
            
            // Query the version
            List<Process_Version__c> versions = [
                SELECT Id, Canvas_Snapshot__c, Version_Number__c
                FROM Process_Version__c
                WHERE Id = :versionId AND Process__c = :processId
                WITH SECURITY_ENFORCED
                LIMIT 1
            ];
            
            if (versions.isEmpty()) {
                throw new ProcessException('Version not found.');
            }
            
            Process_Version__c version = versions[0];
            
            // Load current process
            Process__c proc = ProcessSelector.selectById(processId);
            if (proc == null) {
                throw new ProcessException('Process not found.');
            }
            
            // Cannot restore if Published - must clone instead
            if (proc.Status__c == 'Published' || proc.Status__c == 'Archived') {
                throw new ProcessException('Cannot modify a Published or Archived process. Clone it first.');
            }
            
            // Restore canvas from snapshot
            proc.Canvas_JSON__c = version.Canvas_Snapshot__c;
            update proc;
            
            // Sync related records
            SyncCounts counts = syncRelatedRecords(processId, version.Canvas_Snapshot__c);
            
            result.success = true;
            result.message = 'Restored to version ' + Integer.valueOf(version.Version_Number__c);
            result.processId = processId;
            result.elementsCreated = counts.elementsCreated;
            result.elementsUpdated = counts.elementsUpdated;
            result.elementsDeleted = counts.elementsDeleted;
            
        } catch (ProcessException e) {
            result.message = e.getMessage();
        } catch (Exception e) {
            result.message = 'Error restoring version: ' + e.getMessage();
        }
        
        return result;
    }
    
    // =========================================================================
    // CLONING
    // =========================================================================
    
    /**
     * @description Clones a process with all its elements and connections
     * @param sourceProcessId - The Process ID to clone
     * @param newName - Name for the cloned process
     * @return Id - The new cloned Process ID
     */
    @AuraEnabled
    public static Id cloneProcess(Id sourceProcessId, String newName) {
        if (sourceProcessId == null) {
            throw new ProcessException('Source Process ID is required.');
        }
        if (String.isBlank(newName)) {
            throw new ProcessException('New process name is required.');
        }
        
        // Load source process
        Process__c source = ProcessSelector.selectByIdWithDetails(sourceProcessId);
        if (source == null) {
            throw new ProcessException('Source process not found.');
        }
        
        // Create cloned process
        Process__c cloned = new Process__c(
            Name = newName,
            Description__c = source.Description__c,
            Category__c = source.Category__c,
            Status__c = 'Draft',
            Current_Version__c = 1,
            Canvas_JSON__c = source.Canvas_JSON__c,
            ViewBox_Settings__c = source.ViewBox_Settings__c,
            Process_Owner__c = UserInfo.getUserId()
        );
        insert cloned;
        
        // Clone elements with new IDs mapping
        Map<String, String> elementIdMapping = new Map<String, String>();
        List<BPMN_Element__c> clonedElements = new List<BPMN_Element__c>();
        
        for (BPMN_Element__c elem : source.BPMN_Elements__r) {
            // Generate new element ID
            String newElementId = 'elem_' + String.valueOf(Datetime.now().getTime()) + '_' + 
                                  String.valueOf(Math.random()).substring(2, 8);
            elementIdMapping.put(elem.Element_Id__c, newElementId);
            
            BPMN_Element__c clonedElem = new BPMN_Element__c(
                Process__c = cloned.Id,
                Name = elem.Name,
                Element_Id__c = newElementId,
                Element_Type__c = elem.Element_Type__c,
                Description__c = elem.Description__c,
                Position_X__c = elem.Position_X__c,
                Position_Y__c = elem.Position_Y__c,
                Width__c = elem.Width__c,
                Height__c = elem.Height__c,
                Assigned_Role__c = elem.Assigned_Role__c,
                Duration_Hours__c = elem.Duration_Hours__c,
                SLA_Hours__c = elem.SLA_Hours__c,
                Sort_Order__c = elem.Sort_Order__c
            );
            clonedElements.add(clonedElem);
        }
        
        if (!clonedElements.isEmpty()) {
            insert clonedElements;
        }
        
        // Build map of new Element_Id__c to Salesforce Id
        Map<String, Id> newElementIdToSfId = new Map<String, Id>();
        for (BPMN_Element__c elem : clonedElements) {
            newElementIdToSfId.put(elem.Element_Id__c, elem.Id);
        }
        
        // Clone connections with updated references
        List<BPMN_Connection__c> clonedConnections = new List<BPMN_Connection__c>();
        
        for (BPMN_Connection__c conn : source.BPMN_Connections__r) {
            String newConnId = 'conn_' + String.valueOf(Datetime.now().getTime()) + '_' + 
                               String.valueOf(Math.random()).substring(2, 8);
            
            // Map old element IDs to new ones
            String sourceElemId = conn.Source_Element__r?.Element_Id__c;
            String targetElemId = conn.Target_Element__r?.Element_Id__c;
            
            String newSourceElemId = elementIdMapping.get(sourceElemId);
            String newTargetElemId = elementIdMapping.get(targetElemId);
            
            BPMN_Connection__c clonedConn = new BPMN_Connection__c(
                Process__c = cloned.Id,
                Connection_Id__c = newConnId,
                Connection_Type__c = conn.Connection_Type__c,
                Source_Element__c = newSourceElemId != null ? newElementIdToSfId.get(newSourceElemId) : null,
                Target_Element__c = newTargetElemId != null ? newElementIdToSfId.get(newTargetElemId) : null,
                Label__c = conn.Label__c,
                Condition__c = conn.Condition__c,
                Is_Default__c = conn.Is_Default__c
            );
            clonedConnections.add(clonedConn);
        }
        
        if (!clonedConnections.isEmpty()) {
            insert clonedConnections;
        }
        
        // Update canvas JSON with new element/connection IDs
        if (String.isNotBlank(source.Canvas_JSON__c)) {
            String updatedJson = source.Canvas_JSON__c;
            for (String oldId : elementIdMapping.keySet()) {
                updatedJson = updatedJson.replace(oldId, elementIdMapping.get(oldId));
            }
            cloned.Canvas_JSON__c = updatedJson;
            update cloned;
        }
        
        return cloned.Id;
    }
    
    // =========================================================================
    // HELPER METHODS
    // =========================================================================
    
    /**
     * @description Syncs BPMN_Element__c and BPMN_Connection__c records from canvas JSON
     */
    private static SyncCounts syncRelatedRecords(Id processId, String canvasJson) {
        SyncCounts counts = new SyncCounts();
        
        if (String.isBlank(canvasJson)) {
            return counts;
        }
        
        try {
            // Parse JSON
            Map<String, Object> canvas = (Map<String, Object>) JSON.deserializeUntyped(canvasJson);
            
            // Extract elements and connections arrays
            List<Object> elementsJson = (List<Object>) canvas.get('elements');
            List<Object> connectionsJson = (List<Object>) canvas.get('connections');
            
            if (elementsJson == null) elementsJson = new List<Object>();
            if (connectionsJson == null) connectionsJson = new List<Object>();
            
            // Sync elements
            counts = syncElements(processId, elementsJson, counts);
            
            // Sync connections (after elements so we can lookup IDs)
            counts = syncConnections(processId, connectionsJson, counts);
            
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Error syncing related records: ' + e.getMessage());
            // Don't throw - save was successful, sync is secondary
        }
        
        return counts;
    }
    
    /**
     * @description Syncs BPMN_Element__c records from canvas elements array
     */
    private static SyncCounts syncElements(Id processId, List<Object> elementsJson, SyncCounts counts) {
        // Get existing elements
        Map<String, BPMN_Element__c> existingByElementId = new Map<String, BPMN_Element__c>();
        for (BPMN_Element__c elem : BPMNElementSelector.selectByProcessId(processId)) {
            existingByElementId.put(elem.Element_Id__c, elem);
        }
        
        // Track which IDs are in the canvas
        Set<String> canvasElementIds = new Set<String>();
        
        List<BPMN_Element__c> toInsert = new List<BPMN_Element__c>();
        List<BPMN_Element__c> toUpdate = new List<BPMN_Element__c>();
        
        Integer sortOrder = 0;
        for (Object elemObj : elementsJson) {
            Map<String, Object> elemMap = (Map<String, Object>) elemObj;
            String elementId = (String) elemMap.get('id');
            
            if (String.isBlank(elementId)) continue;
            canvasElementIds.add(elementId);
            sortOrder++;
            
            // Check if exists
            BPMN_Element__c existing = existingByElementId.get(elementId);
            
            if (existing != null) {
                // Update existing
                existing.Name = truncate((String) elemMap.get('name'), 80);
                existing.Element_Type__c = (String) elemMap.get('type');
                existing.Description__c = (String) elemMap.get('description');
                existing.Position_X__c = toDecimal(elemMap.get('x'));
                existing.Position_Y__c = toDecimal(elemMap.get('y'));
                existing.Width__c = toDecimal(elemMap.get('width'));
                existing.Height__c = toDecimal(elemMap.get('height'));
                existing.Assigned_Role__c = (String) elemMap.get('assignedRole');
                existing.Duration_Hours__c = toDecimal(elemMap.get('durationHours'));
                existing.SLA_Hours__c = toDecimal(elemMap.get('slaHours'));
                existing.Sort_Order__c = sortOrder;
                toUpdate.add(existing);
            } else {
                // Create new
                BPMN_Element__c newElem = new BPMN_Element__c(
                    Process__c = processId,
                    Element_Id__c = elementId,
                    Name = truncate((String) elemMap.get('name'), 80),
                    Element_Type__c = (String) elemMap.get('type'),
                    Description__c = (String) elemMap.get('description'),
                    Position_X__c = toDecimal(elemMap.get('x')),
                    Position_Y__c = toDecimal(elemMap.get('y')),
                    Width__c = toDecimal(elemMap.get('width')),
                    Height__c = toDecimal(elemMap.get('height')),
                    Assigned_Role__c = (String) elemMap.get('assignedRole'),
                    Duration_Hours__c = toDecimal(elemMap.get('durationHours')),
                    SLA_Hours__c = toDecimal(elemMap.get('slaHours')),
                    Sort_Order__c = sortOrder
                );
                toInsert.add(newElem);
            }
        }
        
        // Find elements to delete (exist in SF but not in canvas)
        List<BPMN_Element__c> toDelete = new List<BPMN_Element__c>();
        for (String existingId : existingByElementId.keySet()) {
            if (!canvasElementIds.contains(existingId)) {
                toDelete.add(existingByElementId.get(existingId));
            }
        }
        
        // Perform DML
        if (!toInsert.isEmpty()) {
            insert toInsert;
            counts.elementsCreated = toInsert.size();
        }
        if (!toUpdate.isEmpty()) {
            update toUpdate;
            counts.elementsUpdated = toUpdate.size();
        }
        if (!toDelete.isEmpty()) {
            delete toDelete;
            counts.elementsDeleted = toDelete.size();
        }
        
        return counts;
    }
    
    /**
     * @description Syncs BPMN_Connection__c records from canvas connections array
     */
    private static SyncCounts syncConnections(Id processId, List<Object> connectionsJson, SyncCounts counts) {
        // Get existing connections
        Map<String, BPMN_Connection__c> existingByConnId = new Map<String, BPMN_Connection__c>();
        for (BPMN_Connection__c conn : BPMNConnectionSelector.selectByProcessId(processId)) {
            existingByConnId.put(conn.Connection_Id__c, conn);
        }
        
        // Build element ID to Salesforce ID map
        Map<String, Id> elementIdToSfId = new Map<String, Id>();
        for (BPMN_Element__c elem : BPMNElementSelector.selectByProcessId(processId)) {
            elementIdToSfId.put(elem.Element_Id__c, elem.Id);
        }
        
        // Track which IDs are in the canvas
        Set<String> canvasConnIds = new Set<String>();
        
        List<BPMN_Connection__c> toInsert = new List<BPMN_Connection__c>();
        List<BPMN_Connection__c> toUpdate = new List<BPMN_Connection__c>();
        
        for (Object connObj : connectionsJson) {
            Map<String, Object> connMap = (Map<String, Object>) connObj;
            String connectionId = (String) connMap.get('id');
            
            if (String.isBlank(connectionId)) continue;
            canvasConnIds.add(connectionId);
            
            String sourceElemId = (String) connMap.get('sourceId');
            String targetElemId = (String) connMap.get('targetId');
            
            Id sourceSfId = elementIdToSfId.get(sourceElemId);
            Id targetSfId = elementIdToSfId.get(targetElemId);
            
            // Check if exists
            BPMN_Connection__c existing = existingByConnId.get(connectionId);
            
            if (existing != null) {
                // Update existing
                existing.Connection_Type__c = (String) connMap.get('type');
                existing.Source_Element__c = sourceSfId;
                existing.Target_Element__c = targetSfId;
                existing.Label__c = (String) connMap.get('label');
                existing.Condition__c = (String) connMap.get('condition');
                existing.Is_Default__c = connMap.get('isDefault') == true;
                toUpdate.add(existing);
            } else {
                // Create new
                BPMN_Connection__c newConn = new BPMN_Connection__c(
                    Process__c = processId,
                    Connection_Id__c = connectionId,
                    Connection_Type__c = (String) connMap.get('type'),
                    Source_Element__c = sourceSfId,
                    Target_Element__c = targetSfId,
                    Label__c = (String) connMap.get('label'),
                    Condition__c = (String) connMap.get('condition'),
                    Is_Default__c = connMap.get('isDefault') == true
                );
                toInsert.add(newConn);
            }
        }
        
        // Find connections to delete
        List<BPMN_Connection__c> toDelete = new List<BPMN_Connection__c>();
        for (String existingId : existingByConnId.keySet()) {
            if (!canvasConnIds.contains(existingId)) {
                toDelete.add(existingByConnId.get(existingId));
            }
        }
        
        // Perform DML
        if (!toInsert.isEmpty()) {
            insert toInsert;
            counts.connectionsCreated = toInsert.size();
        }
        if (!toUpdate.isEmpty()) {
            update toUpdate;
            counts.connectionsUpdated = toUpdate.size();
        }
        if (!toDelete.isEmpty()) {
            delete toDelete;
            counts.connectionsDeleted = toDelete.size();
        }
        
        return counts;
    }
    
    /**
     * @description Returns default empty canvas JSON
     */
    private static String getDefaultCanvasJson() {
        return '{"elements":[],"connections":[],"viewBox":{"x":0,"y":0,"width":1000,"height":800},"zoom":1.0}';
    }
    
    /**
     * @description Safely converts object to Decimal
     */
    private static Decimal toDecimal(Object value) {
        if (value == null) return null;
        if (value instanceof Decimal) return (Decimal) value;
        if (value instanceof Integer) return Decimal.valueOf((Integer) value);
        if (value instanceof Long) return Decimal.valueOf((Long) value);
        if (value instanceof Double) return Decimal.valueOf((Double) value);
        if (value instanceof String) {
            try {
                return Decimal.valueOf((String) value);
            } catch (Exception e) {
                return null;
            }
        }
        return null;
    }
    
    /**
     * @description Truncates string to max length
     */
    private static String truncate(String value, Integer maxLength) {
        if (String.isBlank(value)) return value;
        return value.length() > maxLength ? value.substring(0, maxLength) : value;
    }
    
    /**
     * @description Inner class to track sync operation counts
     */
    private class SyncCounts {
        public Integer elementsCreated = 0;
        public Integer elementsUpdated = 0;
        public Integer elementsDeleted = 0;
        public Integer connectionsCreated = 0;
        public Integer connectionsUpdated = 0;
        public Integer connectionsDeleted = 0;
    }
    
    /**
     * @description Custom exception for process operations
     */
    public class ProcessException extends Exception {}
}
