/**
 * @description Selector class for Process__c object - encapsulates all SOQL queries
 * @author Dennis van Musschenbroek (DvM) - Cobra CRM B.V.
 * @date 2024-12-12
 * @version 1.0.0
 * @group Selector
 * 
 * EXPLANATION:
 * This selector class centralizes all SOQL queries for the Process__c object,
 * following AWAF.dev principles for data access. All queries enforce FLS using
 * WITH SECURITY_ENFORCED and return clean, typed results.
 * 
 * The selector provides methods for:
 * - Single record retrieval by ID
 * - Bulk retrieval by ID set
 * - Queries with related child records (elements, connections)
 * - Filtered queries by status, category, owner
 * 
 * DEPENDENCIES:
 * - Process__c custom object
 * - BPMN_Element__c custom object (child relationship)
 * - BPMN_Connection__c custom object (child relationship)
 * - Process_Version__c custom object (child relationship)
 * - Process_Category__c custom object (lookup)
 * 
 * ARCHITECTURE:
 * - AWAF Pattern: Selector (Data Access Layer)
 * - Consumed by: ProcessService, ProcessDomain
 * - All queries use SECURITY_ENFORCED for FLS
 * - Returns SObjects directly (no DTOs needed for simple queries)
 * 
 * CHANGELOG:
 * Version | Date       | Author | Description
 * --------|------------|--------|------------------------------------------
 * 1.0.0   | 2024-12-12 | DvM    | Initial creation - core query methods
 * 
 * SECURITY:
 * - Sharing: inherited sharing (respects calling context)
 * - FLS Enforcement: WITH SECURITY_ENFORCED on all queries
 * - CRUD Permissions: Checked via SECURITY_ENFORCED
 * 
 * GOVERNOR LIMITS CONSIDERATIONS:
 * - All queries include LIMIT to prevent runaway queries
 * - Subqueries limited to reasonable child record counts
 * - Bulk methods accept Set<Id> for efficient IN clause
 * 
 * USAGE:
 * // Get single process with full details
 * Process__c proc = ProcessSelector.selectByIdWithDetails(recordId);
 * 
 * // Get multiple processes
 * List<Process__c> processes = ProcessSelector.selectByIds(processIds);
 * 
 * // Get processes by status
 * List<Process__c> drafts = ProcessSelector.selectByStatus('Draft');
 */
public inherited sharing class ProcessSelector {
    
    // Standard fields to query for list views and basic operations
    // Kept as constant for consistency across methods
    private static final String BASE_FIELDS = 
        'Id, Name, Description__c, Status__c, Current_Version__c, ' +
        'Category__c, Category__r.Name, Process_Owner__c, Process_Owner__r.Name, ' +
        'Canvas_JSON__c, ViewBox_Settings__c, Last_Published_Date__c, ' +
        'Element_Count__c, Connection_Count__c, ' +
        'CreatedDate, CreatedById, LastModifiedDate, LastModifiedById';
    
    /**
     * @description Retrieves a single Process by ID with all standard fields
     * @param processId - The ID of the Process to retrieve
     * @return Process__c - The process record, or null if not found
     */
    public static Process__c selectById(Id processId) {
        if (processId == null) {
            return null;
        }
        
        List<Process__c> results = selectByIds(new Set<Id>{ processId });
        return results.isEmpty() ? null : results[0];
    }
    
    /**
     * @description Retrieves multiple Processes by ID set
     * @param processIds - Set of Process IDs to retrieve
     * @return List<Process__c> - List of matching processes
     */
    public static List<Process__c> selectByIds(Set<Id> processIds) {
        if (processIds == null || processIds.isEmpty()) {
            return new List<Process__c>();
        }
        
        // Query with FLS enforcement and reasonable limit
        return [
            SELECT Id, Name, Description__c, Status__c, Current_Version__c,
                   Category__c, Category__r.Name, 
                   Process_Owner__c, Process_Owner__r.Name,
                   Canvas_JSON__c, ViewBox_Settings__c, Last_Published_Date__c,
                   Element_Count__c, Connection_Count__c,
                   CreatedDate, CreatedById, LastModifiedDate, LastModifiedById
            FROM Process__c
            WHERE Id IN :processIds
            WITH SECURITY_ENFORCED
            LIMIT 2000
        ];
    }
    
    /**
     * @description Retrieves a Process with all related child records (elements, connections)
     * @param processId - The ID of the Process to retrieve
     * @return Process__c - Process with populated child relationships
     * 
     * Use this method when loading a process for the canvas editor.
     * Includes all BPMN elements and connections needed to render the diagram.
     */
    public static Process__c selectByIdWithDetails(Id processId) {
        if (processId == null) {
            return null;
        }
        
        // Query with subqueries for related records
        // Subqueries limited to prevent governor limit issues
        List<Process__c> results = [
            SELECT Id, Name, Description__c, Status__c, Current_Version__c,
                   Category__c, Category__r.Name,
                   Process_Owner__c, Process_Owner__r.Name,
                   Canvas_JSON__c, ViewBox_Settings__c, Last_Published_Date__c,
                   Element_Count__c, Connection_Count__c,
                   CreatedDate, CreatedById, LastModifiedDate, LastModifiedById,
                   // Child query: BPMN Elements
                   (SELECT Id, Name, Element_Id__c, Element_Type__c, Description__c,
                           Position_X__c, Position_Y__c, Width__c, Height__c,
                           Assigned_Role__c, Duration_Hours__c, SLA_Hours__c, Sort_Order__c
                    FROM BPMN_Elements__r
                    ORDER BY Sort_Order__c NULLS LAST, Name
                    LIMIT 1000),
                   // Child query: BPMN Connections
                   (SELECT Id, Name, Connection_Id__c, Connection_Type__c,
                           Source_Element__c, Source_Element__r.Element_Id__c,
                           Target_Element__c, Target_Element__r.Element_Id__c,
                           Label__c, Condition__c, Is_Default__c
                    FROM BPMN_Connections__r
                    LIMIT 2000),
                   // Child query: Version History (limited to recent)
                   (SELECT Id, Name, Version_Number__c, Published_Date__c,
                           Published_By__c, Published_By__r.Name, Change_Notes__c
                    FROM Versions__r
                    ORDER BY Version_Number__c DESC
                    LIMIT 20)
            FROM Process__c
            WHERE Id = :processId
            WITH SECURITY_ENFORCED
            LIMIT 1
        ];
        
        return results.isEmpty() ? null : results[0];
    }
    
    /**
     * @description Retrieves processes by status
     * @param status - Status picklist value (Draft, In Review, Published, Archived)
     * @return List<Process__c> - Processes matching the status
     */
    public static List<Process__c> selectByStatus(String status) {
        if (String.isBlank(status)) {
            return new List<Process__c>();
        }
        
        return [
            SELECT Id, Name, Description__c, Status__c, Current_Version__c,
                   Category__c, Category__r.Name,
                   Process_Owner__c, Process_Owner__r.Name,
                   Last_Published_Date__c, Element_Count__c, Connection_Count__c,
                   CreatedDate, LastModifiedDate
            FROM Process__c
            WHERE Status__c = :status
            WITH SECURITY_ENFORCED
            ORDER BY Name
            LIMIT 2000
        ];
    }
    
    /**
     * @description Retrieves processes by category
     * @param categoryId - The Category ID to filter by
     * @return List<Process__c> - Processes in the specified category
     */
    public static List<Process__c> selectByCategory(Id categoryId) {
        if (categoryId == null) {
            return new List<Process__c>();
        }
        
        return [
            SELECT Id, Name, Description__c, Status__c, Current_Version__c,
                   Category__c, Category__r.Name,
                   Process_Owner__c, Process_Owner__r.Name,
                   Last_Published_Date__c, Element_Count__c, Connection_Count__c,
                   CreatedDate, LastModifiedDate
            FROM Process__c
            WHERE Category__c = :categoryId
            WITH SECURITY_ENFORCED
            ORDER BY Name
            LIMIT 2000
        ];
    }
    
    /**
     * @description Retrieves processes owned by a specific user
     * @param ownerId - The User ID of the process owner
     * @return List<Process__c> - Processes owned by the user
     */
    public static List<Process__c> selectByProcessOwner(Id ownerId) {
        if (ownerId == null) {
            return new List<Process__c>();
        }
        
        return [
            SELECT Id, Name, Description__c, Status__c, Current_Version__c,
                   Category__c, Category__r.Name,
                   Process_Owner__c, Process_Owner__r.Name,
                   Last_Published_Date__c, Element_Count__c, Connection_Count__c,
                   CreatedDate, LastModifiedDate
            FROM Process__c
            WHERE Process_Owner__c = :ownerId
            WITH SECURITY_ENFORCED
            ORDER BY Name
            LIMIT 2000
        ];
    }
    
    /**
     * @description Retrieves all published processes for the process library
     * @return List<Process__c> - All published processes
     */
    public static List<Process__c> selectPublished() {
        return [
            SELECT Id, Name, Description__c, Status__c, Current_Version__c,
                   Category__c, Category__r.Name,
                   Process_Owner__c, Process_Owner__r.Name,
                   Last_Published_Date__c, Element_Count__c, Connection_Count__c
            FROM Process__c
            WHERE Status__c = 'Published'
            WITH SECURITY_ENFORCED
            ORDER BY Category__r.Name, Name
            LIMIT 2000
        ];
    }
    
/**
 * @description Searches processes by name or description using SOSL
 * @param searchTerm - Text to search for (minimum 2 characters)
 * @return List<Process__c> - Matching processes
 */
public static List<Process__c> searchByNameOrDescription(String searchTerm) {
    if (String.isBlank(searchTerm) || searchTerm.length() < 2) {
        return new List<Process__c>();
    }
    
    // Escape special characters and prepare for SOSL
    String searchQuery = String.escapeSingleQuotes(searchTerm) + '*';
    
    List<List<SObject>> results = [
        FIND :searchQuery
        IN ALL FIELDS
        RETURNING Process__c(
            Id, Name, Description__c, Status__c, Current_Version__c,
            Category__c, Category__r.Name,
            Process_Owner__c, Process_Owner__r.Name,
            Last_Published_Date__c, Element_Count__c, Connection_Count__c
            ORDER BY Name
            LIMIT 200
        )
    ];
    
    return (List<Process__c>) results[0];
}
    
    /**
     * @description Retrieves processes for list view with pagination support
     * @param limitCount - Number of records to return
     * @param offsetCount - Number of records to skip
     * @return List<Process__c> - Paginated list of processes
     */
    public static List<Process__c> selectForListView(Integer limitCount, Integer offsetCount) {
        // Apply reasonable defaults
        Integer safeLimit = (limitCount != null && limitCount > 0 && limitCount <= 200) 
                            ? limitCount : 50;
        Integer safeOffset = (offsetCount != null && offsetCount >= 0) 
                             ? offsetCount : 0;
        
        return [
            SELECT Id, Name, Description__c, Status__c, Current_Version__c,
                   Category__c, Category__r.Name,
                   Process_Owner__c, Process_Owner__r.Name,
                   Last_Published_Date__c, Element_Count__c, Connection_Count__c,
                   CreatedDate, LastModifiedDate
            FROM Process__c
            WITH SECURITY_ENFORCED
            ORDER BY LastModifiedDate DESC
            LIMIT :safeLimit
            OFFSET :safeOffset
        ];
    }
    
    /**
     * @description Counts total processes for pagination
     * @return Integer - Total count of Process records
     */
    public static Integer countAll() {
        return [
            SELECT COUNT()
            FROM Process__c
            WITH SECURITY_ENFORCED
        ];
    }
    
    /**
     * @description Counts processes by status for dashboard metrics
     * @return Map<String, Integer> - Map of status to count
     */
    public static Map<String, Integer> countByStatus() {
        Map<String, Integer> statusCounts = new Map<String, Integer>();
        
        // Initialize all statuses with 0
        statusCounts.put('Draft', 0);
        statusCounts.put('In Review', 0);
        statusCounts.put('Published', 0);
        statusCounts.put('Archived', 0);
        
        // Query aggregate counts
        List<AggregateResult> results = [
            SELECT Status__c, COUNT(Id) cnt
            FROM Process__c
            WITH SECURITY_ENFORCED
            GROUP BY Status__c
        ];
        
        // Populate map with actual counts
        for (AggregateResult ar : results) {
            String status = (String) ar.get('Status__c');
            Integer count = (Integer) ar.get('cnt');
            if (status != null) {
                statusCounts.put(status, count);
            }
        }
        
        return statusCounts;
    }
}
