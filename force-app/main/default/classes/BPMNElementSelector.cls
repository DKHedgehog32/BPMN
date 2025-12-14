/**
 * @description Selector class for BPMN_Element__c object - encapsulates all element queries
 * @author Dennis van Musschenbroek (DvM) - Cobra CRM B.V.
 * @date 2024-12-12
 * @version 1.0.0
 * @group Selector
 * 
 * EXPLANATION:
 * This selector centralizes all SOQL queries for BPMN_Element__c records.
 * BPMN Elements are the shapes/nodes in a process diagram including:
 * - Events (Start, End, Intermediate)
 * - Activities (Tasks, Sub-Processes)
 * - Gateways (Exclusive, Parallel, Inclusive)
 * - Data Objects and Annotations
 * 
 * Queries are optimized for:
 * - Canvas loading (all elements for a process)
 * - Element-specific operations (by Element_Id__c)
 * - Reporting and analytics (aggregations)
 * 
 * DEPENDENCIES:
 * - BPMN_Element__c custom object
 * - Process__c custom object (parent)
 * - BPMN_Connection__c (for relationship queries)
 * 
 * ARCHITECTURE:
 * - AWAF Pattern: Selector (Data Access Layer)
 * - Consumed by: BPMNElementService, ProcessService
 * - All queries use SECURITY_ENFORCED for FLS
 * 
 * CHANGELOG:
 * Version | Date       | Author | Description
 * --------|------------|--------|------------------------------------------
 * 1.0.0   | 2024-12-12 | DvM    | Initial creation - core query methods
 * 
 * SECURITY:
 * - Sharing: inherited sharing (respects parent Process sharing)
 * - FLS Enforcement: WITH SECURITY_ENFORCED on all queries
 * 
 * GOVERNOR LIMITS CONSIDERATIONS:
 * - Queries limited to 1000 elements per process (reasonable max)
 * - Bulk operations use Set<Id> for efficient IN clauses
 * 
 * USAGE:
 * // Get all elements for a process
 * List<BPMN_Element__c> elements = BPMNElementSelector.selectByProcessId(processId);
 * 
 * // Get elements by external IDs (for canvas sync)
 * List<BPMN_Element__c> elements = BPMNElementSelector.selectByElementIds(elementIds);
 */
public inherited sharing class BPMNElementSelector {
    
    /**
     * @description Retrieves a single element by Salesforce ID
     * @param elementId - The Salesforce ID of the element
     * @return BPMN_Element__c - The element record, or null if not found
     */
    public static BPMN_Element__c selectById(Id elementId) {
        if (elementId == null) {
            return null;
        }
        
        List<BPMN_Element__c> results = selectByIds(new Set<Id>{ elementId });
        return results.isEmpty() ? null : results[0];
    }
    
    /**
     * @description Retrieves multiple elements by Salesforce ID set
     * @param elementIds - Set of Salesforce IDs
     * @return List<BPMN_Element__c> - Matching elements
     */
    public static List<BPMN_Element__c> selectByIds(Set<Id> elementIds) {
        if (elementIds == null || elementIds.isEmpty()) {
            return new List<BPMN_Element__c>();
        }
        
        return [
            SELECT Id, Name, Process__c, Element_Id__c, Element_Type__c, Description__c,
                   Position_X__c, Position_Y__c, Width__c, Height__c,
                   Assigned_Role__c, Duration_Hours__c, SLA_Hours__c, Sort_Order__c,
                   CreatedDate, LastModifiedDate
            FROM BPMN_Element__c
            WHERE Id IN :elementIds
            WITH SECURITY_ENFORCED
            LIMIT 2000
        ];
    }
    
    /**
     * @description Retrieves all elements for a specific process
     * @param processId - The parent Process ID
     * @return List<BPMN_Element__c> - All elements belonging to the process
     * 
     * Primary method for loading canvas elements. Returns elements ordered
     * by Sort_Order for consistent rendering sequence.
     */
    public static List<BPMN_Element__c> selectByProcessId(Id processId) {
        if (processId == null) {
            return new List<BPMN_Element__c>();
        }
        
        return [
            SELECT Id, Name, Process__c, Element_Id__c, Element_Type__c, Description__c,
                   Position_X__c, Position_Y__c, Width__c, Height__c,
                   Assigned_Role__c, Duration_Hours__c, SLA_Hours__c, Sort_Order__c,
                   CreatedDate, LastModifiedDate
            FROM BPMN_Element__c
            WHERE Process__c = :processId
            WITH SECURITY_ENFORCED
            ORDER BY Sort_Order__c NULLS LAST, Name
            LIMIT 1000
        ];
    }
    
    /**
     * @description Retrieves elements by their canvas Element_Id__c values
     * @param elementIds - Set of Element_Id__c strings (external IDs from canvas)
     * @return List<BPMN_Element__c> - Matching elements
     * 
     * Used for syncing canvas state with Salesforce records.
     * Element_Id__c is generated client-side when shapes are created.
     */
    public static List<BPMN_Element__c> selectByElementIds(Set<String> elementIds) {
        if (elementIds == null || elementIds.isEmpty()) {
            return new List<BPMN_Element__c>();
        }
        
        return [
            SELECT Id, Name, Process__c, Element_Id__c, Element_Type__c, Description__c,
                   Position_X__c, Position_Y__c, Width__c, Height__c,
                   Assigned_Role__c, Duration_Hours__c, SLA_Hours__c, Sort_Order__c
            FROM BPMN_Element__c
            WHERE Element_Id__c IN :elementIds
            WITH SECURITY_ENFORCED
            LIMIT 2000
        ];
    }
    
    /**
     * @description Retrieves elements by type for a specific process
     * @param processId - The parent Process ID
     * @param elementType - The element type (e.g., 'UserTask', 'ExclusiveGateway')
     * @return List<BPMN_Element__c> - Matching elements
     */
    public static List<BPMN_Element__c> selectByProcessAndType(Id processId, String elementType) {
        if (processId == null || String.isBlank(elementType)) {
            return new List<BPMN_Element__c>();
        }
        
        return [
            SELECT Id, Name, Process__c, Element_Id__c, Element_Type__c, Description__c,
                   Position_X__c, Position_Y__c, Width__c, Height__c,
                   Assigned_Role__c, Duration_Hours__c, SLA_Hours__c, Sort_Order__c
            FROM BPMN_Element__c
            WHERE Process__c = :processId
              AND Element_Type__c = :elementType
            WITH SECURITY_ENFORCED
            ORDER BY Sort_Order__c NULLS LAST, Name
            LIMIT 1000
        ];
    }
    
    /**
     * @description Retrieves elements with connections (for flow analysis)
     * @param processId - The parent Process ID
     * @return List<BPMN_Element__c> - Elements with incoming/outgoing connection info
     */
    public static List<BPMN_Element__c> selectByProcessIdWithConnections(Id processId) {
        if (processId == null) {
            return new List<BPMN_Element__c>();
        }
        
        return [
            SELECT Id, Name, Process__c, Element_Id__c, Element_Type__c, Description__c,
                   Position_X__c, Position_Y__c, Width__c, Height__c,
                   Assigned_Role__c, Duration_Hours__c, SLA_Hours__c, Sort_Order__c,
                   // Outgoing connections
                   (SELECT Id, Connection_Id__c, Target_Element__c, Target_Element__r.Element_Id__c,
                           Label__c, Condition__c, Is_Default__c
                    FROM Outgoing_Connections__r),
                   // Incoming connections
                   (SELECT Id, Connection_Id__c, Source_Element__c, Source_Element__r.Element_Id__c,
                           Label__c
                    FROM Incoming_Connections__r)
            FROM BPMN_Element__c
            WHERE Process__c = :processId
            WITH SECURITY_ENFORCED
            ORDER BY Sort_Order__c NULLS LAST, Name
            LIMIT 1000
        ];
    }
    
    /**
     * @description Gets start events for a process (for flow validation)
     * @param processId - The parent Process ID
     * @return List<BPMN_Element__c> - Start event elements
     */
    public static List<BPMN_Element__c> selectStartEvents(Id processId) {
        if (processId == null) {
            return new List<BPMN_Element__c>();
        }
        
        return [
            SELECT Id, Name, Element_Id__c, Element_Type__c, Position_X__c, Position_Y__c
            FROM BPMN_Element__c
            WHERE Process__c = :processId
              AND (Element_Type__c = 'StartEvent'
                   OR Element_Type__c = 'TimerStartEvent'
                   OR Element_Type__c = 'MessageStartEvent')
            WITH SECURITY_ENFORCED
            LIMIT 100
        ];
    }
    
    /**
     * @description Gets end events for a process (for flow validation)
     * @param processId - The parent Process ID
     * @return List<BPMN_Element__c> - End event elements
     */
    public static List<BPMN_Element__c> selectEndEvents(Id processId) {
        if (processId == null) {
            return new List<BPMN_Element__c>();
        }
        
        return [
            SELECT Id, Name, Element_Id__c, Element_Type__c, Position_X__c, Position_Y__c
            FROM BPMN_Element__c
            WHERE Process__c = :processId
              AND (Element_Type__c = 'EndEvent'
                   OR Element_Type__c = 'ErrorEndEvent'
                   OR Element_Type__c = 'TerminateEndEvent'
                   OR Element_Type__c = 'MessageEndEvent')
            WITH SECURITY_ENFORCED
            LIMIT 100
        ];
    }
    
    /**
     * @description Counts elements by type for a process (for metrics)
     * @param processId - The parent Process ID
     * @return Map<String, Integer> - Map of element type to count
     */
    public static Map<String, Integer> countByTypeForProcess(Id processId) {
        Map<String, Integer> typeCounts = new Map<String, Integer>();
        
        if (processId == null) {
            return typeCounts;
        }
        
        List<AggregateResult> results = [
            SELECT Element_Type__c, COUNT(Id) cnt
            FROM BPMN_Element__c
            WHERE Process__c = :processId
            WITH SECURITY_ENFORCED
            GROUP BY Element_Type__c
        ];
        
        for (AggregateResult ar : results) {
            String elementType = (String) ar.get('Element_Type__c');
            Integer count = (Integer) ar.get('cnt');
            if (elementType != null) {
                typeCounts.put(elementType, count);
            }
        }
        
        return typeCounts;
    }
    
    /**
     * @description Retrieves elements by assigned role (for workload analysis)
     * @param processId - The parent Process ID
     * @param roleName - The role name to filter by
     * @return List<BPMN_Element__c> - Tasks assigned to the specified role
     */
    public static List<BPMN_Element__c> selectByAssignedRole(Id processId, String roleName) {
        if (processId == null || String.isBlank(roleName)) {
            return new List<BPMN_Element__c>();
        }
        
        return [
            SELECT Id, Name, Element_Id__c, Element_Type__c, Description__c,
                   Assigned_Role__c, Duration_Hours__c, SLA_Hours__c
            FROM BPMN_Element__c
            WHERE Process__c = :processId
              AND Assigned_Role__c = :roleName
            WITH SECURITY_ENFORCED
            ORDER BY Sort_Order__c NULLS LAST
            LIMIT 500
        ];
    }
    
    /**
     * @description Gets total duration for all tasks in a process
     * @param processId - The parent Process ID
     * @return Decimal - Sum of Duration_Hours__c for all elements
     */
    public static Decimal getTotalDurationForProcess(Id processId) {
        if (processId == null) {
            return 0;
        }
        
        List<AggregateResult> results = [
            SELECT SUM(Duration_Hours__c) totalDuration
            FROM BPMN_Element__c
            WHERE Process__c = :processId
              AND Duration_Hours__c != NULL
            WITH SECURITY_ENFORCED
        ];
        
        if (results.isEmpty() || results[0].get('totalDuration') == null) {
            return 0;
        }
        
        return (Decimal) results[0].get('totalDuration');
    }
}
