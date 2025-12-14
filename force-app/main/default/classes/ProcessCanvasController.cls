/**
 * @description Apex controller for the Process Canvas LWC component
 * @author Dennis van Musschenbroek (DvM) - Cobra CRM B.V.
 * @date 2024-12-12
 * @version 1.0.0
 * @group Controller
 * 
 * EXPLANATION:
 * This controller provides the Apex backend for the processCanvas Lightning Web Component.
 * It serves as a thin layer that delegates to ProcessService for business logic.
 * 
 * DEPENDENCIES:
 * - ProcessService: Core business logic
 * - ProcessSelector: Data access
 * 
 * ARCHITECTURE:
 * - AWAF Pattern: Controller (UI Layer)
 * - Thin layer: Minimal logic, delegates to Service
 * 
 * CHANGELOG:
 * Version | Date       | Author | Description
 * --------|------------|--------|------------------------------------------
 * 1.0.0   | 2024-12-12 | DvM    | Initial creation - canvas operations
 * 
 * SECURITY:
 * - Sharing: with sharing (respects org sharing rules)
 * - FLS: Enforced via Selectors
 */
public with sharing class ProcessCanvasController {
    
    /**
     * @description Loads a process with all data needed for the canvas editor
     * @param processId - The Process record ID
     * @return ProcessService.ProcessData - Complete process data for canvas
     */
    @AuraEnabled(cacheable=true)
    public static ProcessService.ProcessData loadProcess(Id processId) {
        return ProcessService.loadProcess(processId);
    }
    
    /**
     * @description Gets lightweight process info for header/navigation
     * @param processId - The Process record ID
     * @return Map<String, Object> - Basic process info
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getProcessInfo(Id processId) {
        if (processId == null) {
            throw new AuraHandledException('Process ID is required.');
        }
        
        Process__c proc = ProcessSelector.selectById(processId);
        if (proc == null) {
            throw new AuraHandledException('Process not found.');
        }
        
        Map<String, Object> info = new Map<String, Object>();
        info.put('id', proc.Id);
        info.put('name', proc.Name);
        info.put('status', proc.Status__c);
        info.put('version', proc.Current_Version__c);
        info.put('categoryName', proc.Category__r?.Name);
        info.put('ownerName', proc.Process_Owner__r?.Name);
        info.put('isEditable', proc.Status__c == 'Draft' || proc.Status__c == 'In Review');
        info.put('lastModified', proc.LastModifiedDate);
        
        return info;
    }
    
    /**
     * @description Saves the canvas state to the process record
     * @param processId - The Process record ID
     * @param canvasJson - The canvas JSON state
     * @param viewBoxSettings - Optional viewport settings JSON
     * @return ProcessService.SaveResult - Result with success/failure info
     */
    @AuraEnabled
    public static ProcessService.SaveResult saveProcess(Id processId, String canvasJson, String viewBoxSettings) {
        try {
            return ProcessService.saveProcess(processId, canvasJson, viewBoxSettings);
        } catch (Exception e) {
            ProcessService.SaveResult result = new ProcessService.SaveResult();
            result.success = false;
            result.message = e.getMessage();
            return result;
        }
    }
    
    /**
     * @description Auto-saves canvas state (called periodically by LWC)
     * @param processId - The Process record ID
     * @param canvasJson - The canvas JSON state
     * @return Boolean - True if save succeeded
     */
    @AuraEnabled
    public static Boolean autoSave(Id processId, String canvasJson) {
        try {
            ProcessService.SaveResult result = ProcessService.saveProcess(processId, canvasJson, null);
            return result.success;
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Auto-save failed: ' + e.getMessage());
            return false;
        }
    }
    
    /**
     * @description Creates a new process
     * @param name - Process name
     * @param description - Process description
     * @param categoryId - Optional category ID
     * @return Id - The new process record ID
     */
    @AuraEnabled
    public static Id createProcessBasic(String name, String description, Id categoryId) {
        try {
            return ProcessService.createProcess(name, description, categoryId, null);
        } catch (ProcessService.ProcessException e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
    
    /**
     * @description Creates a new process with initial canvas state
     * @param name - Process name
     * @param description - Process description  
     * @param canvasJson - Initial canvas JSON state
     * @return ProcessService.ProcessData - Complete process data
     */
    @AuraEnabled
    public static ProcessService.ProcessData createProcess(String name, String description, String canvasJson) {
        try {
            // Create the process
            Id processId = ProcessService.createProcess(name, description, null, canvasJson);
            
            // Return the full process data
            return ProcessService.loadProcess(processId);
        } catch (ProcessService.ProcessException e) {
            throw new AuraHandledException(e.getMessage());
        } catch (Exception e) {
            throw new AuraHandledException('Error creating process: ' + e.getMessage());
        }
    }
    
    /**
     * @description Clones an existing process
     * @param sourceProcessId - Process ID to clone
     * @param newName - Name for the cloned process
     * @return Id - The cloned process record ID
     */
    @AuraEnabled
    public static Id cloneProcess(Id sourceProcessId, String newName) {
        try {
            return ProcessService.cloneProcess(sourceProcessId, newName);
        } catch (ProcessService.ProcessException e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
    
    /**
     * @description Publishes the current process state as a new version
     * @param processId - The Process record ID
     * @param canvasJson - Current canvas state to save before publishing
     * @param changeNotes - Description of changes
     * @return ProcessService.ProcessData - Updated process data after publish
     */
    @AuraEnabled
    public static ProcessService.ProcessData publishProcess(Id processId, String canvasJson, String changeNotes) {
        try {
            // First save the current canvas state
            if (String.isNotBlank(canvasJson)) {
                ProcessService.saveProcess(processId, canvasJson, null);
            }
            
            // Then publish
            ProcessService.publishProcess(processId, changeNotes);
            
            // Return updated process data
            return ProcessService.loadProcess(processId);
        } catch (ProcessService.ProcessException e) {
            throw new AuraHandledException(e.getMessage());
        } catch (Exception e) {
            throw new AuraHandledException('Error publishing process: ' + e.getMessage());
        }
    }
    
    /**
     * @description Validates a process is ready for publishing
     * @param processId - The Process record ID
     * @return ProcessService.ValidationResult - Validation errors/warnings
     */
    @AuraEnabled
    public static ProcessService.ValidationResult validateForPublish(Id processId) {
        return ProcessService.validateProcessForPublish(processId);
    }
    
    /**
     * @description Gets version history for a process
     * @param processId - The Process record ID
     * @return List<Map<String, Object>> - Version history records
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> getVersionHistory(Id processId) {
        if (processId == null) {
            return new List<Map<String, Object>>();
        }
        
        List<Map<String, Object>> versions = new List<Map<String, Object>>();
        
        List<Process_Version__c> versionRecords = [
            SELECT Id, Name, Version_Number__c, Published_Date__c,
                   Published_By__c, Published_By__r.Name, Change_Notes__c
            FROM Process_Version__c
            WHERE Process__c = :processId
            WITH SECURITY_ENFORCED
            ORDER BY Version_Number__c DESC
            LIMIT 50
        ];
        
        for (Process_Version__c v : versionRecords) {
            Map<String, Object> version = new Map<String, Object>();
            version.put('id', v.Id);
            version.put('name', v.Name);
            version.put('versionNumber', v.Version_Number__c);
            version.put('publishedDate', v.Published_Date__c);
            version.put('publishedById', v.Published_By__c);
            version.put('publishedByName', v.Published_By__r?.Name);
            version.put('changeNotes', v.Change_Notes__c);
            versions.add(version);
        }
        
        return versions;
    }
    
    /**
     * @description Restores a previous version
     * @param processId - The Process record ID
     * @param versionId - The Version record ID to restore
     * @return ProcessService.SaveResult - Result of the restore
     */
    @AuraEnabled
    public static ProcessService.SaveResult restoreVersion(Id processId, Id versionId) {
        try {
            return ProcessService.restoreVersion(processId, versionId);
        } catch (ProcessService.ProcessException e) {
            ProcessService.SaveResult result = new ProcessService.SaveResult();
            result.success = false;
            result.message = e.getMessage();
            return result;
        }
    }
    
    /**
     * @description Gets list of processes for navigation/selection
     * @param status - Optional status filter
     * @param categoryId - Optional category filter
     * @param searchTerm - Optional search term
     * @param limitCount - Max records to return
     * @return List<Map<String, Object>> - Process list for display
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> getProcessList(String status, Id categoryId, String searchTerm, Integer limitCount) {
        List<Map<String, Object>> processList = new List<Map<String, Object>>();
        List<Process__c> processes;
        
        // Apply filters
        if (String.isNotBlank(searchTerm)) {
            processes = ProcessSelector.searchByNameOrDescription(searchTerm);
        } else if (String.isNotBlank(status)) {
            processes = ProcessSelector.selectByStatus(status);
        } else if (categoryId != null) {
            processes = ProcessSelector.selectByCategory(categoryId);
        } else {
            processes = ProcessSelector.selectForListView(limitCount != null ? limitCount : 50, 0);
        }
        
        for (Process__c p : processes) {
            Map<String, Object> proc = new Map<String, Object>();
            proc.put('id', p.Id);
            proc.put('name', p.Name);
            proc.put('description', p.Description__c);
            proc.put('status', p.Status__c);
            proc.put('version', p.Current_Version__c);
            proc.put('categoryName', p.Category__r?.Name);
            proc.put('ownerName', p.Process_Owner__r?.Name);
            proc.put('elementCount', p.Element_Count__c);
            proc.put('connectionCount', p.Connection_Count__c);
            proc.put('lastModified', p.LastModifiedDate);
            processList.add(proc);
        }
        
        return processList;
    }
    
    /**
     * @description Gets categories for dropdown/tree
     * @return List<Map<String, Object>> - Category list
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> getCategories() {
        List<Map<String, Object>> categories = new List<Map<String, Object>>();
        
        List<Process_Category__c> cats = [
            SELECT Id, Name, Description__c, Parent_Category__c, Sort_Order__c
            FROM Process_Category__c
            WHERE Is_Active__c = TRUE
            WITH SECURITY_ENFORCED
            ORDER BY Sort_Order__c, Name
            LIMIT 500
        ];
        
        for (Process_Category__c c : cats) {
            Map<String, Object> cat = new Map<String, Object>();
            cat.put('id', c.Id);
            cat.put('name', c.Name);
            cat.put('description', c.Description__c);
            cat.put('parentId', c.Parent_Category__c);
            categories.add(cat);
        }
        
        return categories;
    }
    
    /**
     * @description Deletes a process
     * @param processId - The Process record ID
     */
    @AuraEnabled
    public static void deleteProcess(Id processId) {
        try {
            ProcessService.deleteProcess(processId);
        } catch (ProcessService.ProcessException e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
    
    /**
     * @description Updates process status
     * @param processId - The Process record ID
     * @param newStatus - New status value
     */
    @AuraEnabled
    public static void updateStatus(Id processId, String newStatus) {
        if (processId == null) {
            throw new AuraHandledException('Process ID is required.');
        }
        
        Set<String> validStatuses = new Set<String>{'Draft', 'In Review', 'Published', 'Archived'};
        if (!validStatuses.contains(newStatus)) {
            throw new AuraHandledException('Invalid status value.');
        }
        
        Process__c proc = new Process__c(
            Id = processId,
            Status__c = newStatus
        );
        
        try {
            update proc;
        } catch (DmlException e) {
            throw new AuraHandledException('Error updating status: ' + e.getMessage());
        }
    }
    
    /**
     * @description Gets dashboard metrics
     * @return Map<String, Object> - Dashboard data
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getDashboardMetrics() {
        Map<String, Object> metrics = new Map<String, Object>();
        
        // Counts by status
        metrics.put('statusCounts', ProcessSelector.countByStatus());
        
        // Total count
        metrics.put('totalProcesses', ProcessSelector.countAll());
        
        return metrics;
    }
}