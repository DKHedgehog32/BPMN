/**
 * @description Selector class for BPMN_Connection__c object - encapsulates all connection queries
 * @author Dennis van Musschenbroek (DvM) - Cobra CRM B.V.
 * @date 2024-12-12
 * @version 1.0.0
 * @group Selector
 * 
 * EXPLANATION:
 * This selector centralizes all SOQL queries for BPMN_Connection__c records.
 * BPMN Connections represent the sequence flows between elements in a process diagram.
 * 
 * Connection types include:
 * - Sequence Flow: Normal process flow
 * - Conditional Flow: Flow with conditions (from gateways)
 * - Default Flow: Default path from exclusive gateways
 * - Message Flow: Communication between pools
 * 
 * DEPENDENCIES:
 * - BPMN_Connection__c custom object
 * - BPMN_Element__c custom object (source/target lookups)
 * - Process__c custom object (parent)
 * 
 * ARCHITECTURE:
 * - AWAF Pattern: Selector (Data Access Layer)
 * - Consumed by: BPMNConnectionService, ProcessService
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
 * USAGE:
 * // Get all connections for a process
 * List<BPMN_Connection__c> connections = BPMNConnectionSelector.selectByProcessId(processId);
 * 
 * // Get connections from a specific element
 * List<BPMN_Connection__c> outgoing = BPMNConnectionSelector.selectBySourceElement(elementId);
 */
public inherited sharing class BPMNConnectionSelector {
    
    /**
     * @description Retrieves a single connection by Salesforce ID
     * @param connectionId - The Salesforce ID of the connection
     * @return BPMN_Connection__c - The connection record, or null if not found
     */
    public static BPMN_Connection__c selectById(Id connectionId) {
        if (connectionId == null) {
            return null;
        }
        
        List<BPMN_Connection__c> results = selectByIds(new Set<Id>{ connectionId });
        return results.isEmpty() ? null : results[0];
    }
    
    /**
     * @description Retrieves multiple connections by Salesforce ID set
     * @param connectionIds - Set of Salesforce IDs
     * @return List<BPMN_Connection__c> - Matching connections
     */
    public static List<BPMN_Connection__c> selectByIds(Set<Id> connectionIds) {
        if (connectionIds == null || connectionIds.isEmpty()) {
            return new List<BPMN_Connection__c>();
        }
        
        return [
            SELECT Id, Name, Process__c, Connection_Id__c, Connection_Type__c,
                   Source_Element__c, Source_Element__r.Name, Source_Element__r.Element_Id__c,
                   Target_Element__c, Target_Element__r.Name, Target_Element__r.Element_Id__c,
                   Label__c, Condition__c, Is_Default__c,
                   CreatedDate, LastModifiedDate
            FROM BPMN_Connection__c
            WHERE Id IN :connectionIds
            WITH SECURITY_ENFORCED
            LIMIT 2000
        ];
    }
    
    /**
     * @description Retrieves all connections for a specific process
     * @param processId - The parent Process ID
     * @return List<BPMN_Connection__c> - All connections belonging to the process
     * 
     * Primary method for loading canvas connections.
     */
    public static List<BPMN_Connection__c> selectByProcessId(Id processId) {
        if (processId == null) {
            return new List<BPMN_Connection__c>();
        }
        
        return [
            SELECT Id, Name, Process__c, Connection_Id__c, Connection_Type__c,
                   Source_Element__c, Source_Element__r.Name, Source_Element__r.Element_Id__c,
                   Target_Element__c, Target_Element__r.Name, Target_Element__r.Element_Id__c,
                   Label__c, Condition__c, Is_Default__c,
                   CreatedDate, LastModifiedDate
            FROM BPMN_Connection__c
            WHERE Process__c = :processId
            WITH SECURITY_ENFORCED
            LIMIT 2000
        ];
    }
    
    /**
     * @description Retrieves connections by their canvas Connection_Id__c values
     * @param connectionIds - Set of Connection_Id__c strings (external IDs from canvas)
     * @return List<BPMN_Connection__c> - Matching connections
     * 
     * Used for syncing canvas state with Salesforce records.
     */
    public static List<BPMN_Connection__c> selectByConnectionIds(Set<String> connectionIds) {
        if (connectionIds == null || connectionIds.isEmpty()) {
            return new List<BPMN_Connection__c>();
        }
        
        return [
            SELECT Id, Name, Process__c, Connection_Id__c, Connection_Type__c,
                   Source_Element__c, Source_Element__r.Element_Id__c,
                   Target_Element__c, Target_Element__r.Element_Id__c,
                   Label__c, Condition__c, Is_Default__c
            FROM BPMN_Connection__c
            WHERE Connection_Id__c IN :connectionIds
            WITH SECURITY_ENFORCED
            LIMIT 2000
        ];
    }
    
    /**
     * @description Retrieves outgoing connections from a specific element
     * @param sourceElementId - The Salesforce ID of the source element
     * @return List<BPMN_Connection__c> - Connections originating from the element
     */
    public static List<BPMN_Connection__c> selectBySourceElement(Id sourceElementId) {
        if (sourceElementId == null) {
            return new List<BPMN_Connection__c>();
        }
        
        return [
            SELECT Id, Name, Process__c, Connection_Id__c, Connection_Type__c,
                   Source_Element__c, Source_Element__r.Element_Id__c,
                   Target_Element__c, Target_Element__r.Name, Target_Element__r.Element_Id__c,
                   Label__c, Condition__c, Is_Default__c
            FROM BPMN_Connection__c
            WHERE Source_Element__c = :sourceElementId
            WITH SECURITY_ENFORCED
            LIMIT 500
        ];
    }
    
    /**
     * @description Retrieves incoming connections to a specific element
     * @param targetElementId - The Salesforce ID of the target element
     * @return List<BPMN_Connection__c> - Connections terminating at the element
     */
    public static List<BPMN_Connection__c> selectByTargetElement(Id targetElementId) {
        if (targetElementId == null) {
            return new List<BPMN_Connection__c>();
        }
        
        return [
            SELECT Id, Name, Process__c, Connection_Id__c, Connection_Type__c,
                   Source_Element__c, Source_Element__r.Name, Source_Element__r.Element_Id__c,
                   Target_Element__c, Target_Element__r.Element_Id__c,
                   Label__c, Condition__c, Is_Default__c
            FROM BPMN_Connection__c
            WHERE Target_Element__c = :targetElementId
            WITH SECURITY_ENFORCED
            LIMIT 500
        ];
    }
    
    /**
     * @description Retrieves all connections involving a specific element (as source or target)
     * @param elementId - The Salesforce ID of the element
     * @return List<BPMN_Connection__c> - All connections involving the element
     * 
     * Useful for deleting connections when an element is deleted.
     */
    public static List<BPMN_Connection__c> selectByElement(Id elementId) {
        if (elementId == null) {
            return new List<BPMN_Connection__c>();
        }
        
        return [
            SELECT Id, Name, Process__c, Connection_Id__c, Connection_Type__c,
                   Source_Element__c, Target_Element__c,
                   Label__c, Condition__c, Is_Default__c
            FROM BPMN_Connection__c
            WHERE Source_Element__c = :elementId
               OR Target_Element__c = :elementId
            WITH SECURITY_ENFORCED
            LIMIT 1000
        ];
    }
    
    /**
     * @description Retrieves connections between two specific elements
     * @param sourceElementId - The source element ID
     * @param targetElementId - The target element ID
     * @return List<BPMN_Connection__c> - Connections between the two elements
     * 
     * Used to check for duplicate connections.
     */
    public static List<BPMN_Connection__c> selectBySourceAndTarget(Id sourceElementId, Id targetElementId) {
        if (sourceElementId == null || targetElementId == null) {
            return new List<BPMN_Connection__c>();
        }
        
        return [
            SELECT Id, Name, Connection_Id__c, Label__c, Condition__c
            FROM BPMN_Connection__c
            WHERE Source_Element__c = :sourceElementId
              AND Target_Element__c = :targetElementId
            WITH SECURITY_ENFORCED
            LIMIT 10
        ];
    }
    
    /**
     * @description Retrieves connections by type for a process
     * @param processId - The parent Process ID
     * @param connectionType - The connection type (SequenceFlow, ConditionalFlow, etc.)
     * @return List<BPMN_Connection__c> - Matching connections
     */
    public static List<BPMN_Connection__c> selectByProcessAndType(Id processId, String connectionType) {
        if (processId == null || String.isBlank(connectionType)) {
            return new List<BPMN_Connection__c>();
        }
        
        return [
            SELECT Id, Name, Connection_Id__c, Connection_Type__c,
                   Source_Element__c, Source_Element__r.Element_Id__c,
                   Target_Element__c, Target_Element__r.Element_Id__c,
                   Label__c, Condition__c, Is_Default__c
            FROM BPMN_Connection__c
            WHERE Process__c = :processId
              AND Connection_Type__c = :connectionType
            WITH SECURITY_ENFORCED
            LIMIT 1000
        ];
    }
    
    /**
     * @description Gets default flows for a process (from gateways)
     * @param processId - The parent Process ID
     * @return List<BPMN_Connection__c> - Connections marked as default
     */
    public static List<BPMN_Connection__c> selectDefaultFlows(Id processId) {
        if (processId == null) {
            return new List<BPMN_Connection__c>();
        }
        
        return [
            SELECT Id, Name, Connection_Id__c,
                   Source_Element__c, Source_Element__r.Name,
                   Target_Element__c, Target_Element__r.Name,
                   Label__c
            FROM BPMN_Connection__c
            WHERE Process__c = :processId
              AND Is_Default__c = TRUE
            WITH SECURITY_ENFORCED
            LIMIT 100
        ];
    }
    
    /**
     * @description Counts connections by type for a process (for metrics)
     * @param processId - The parent Process ID
     * @return Map<String, Integer> - Map of connection type to count
     */
    public static Map<String, Integer> countByTypeForProcess(Id processId) {
        Map<String, Integer> typeCounts = new Map<String, Integer>();
        
        if (processId == null) {
            return typeCounts;
        }
        
        List<AggregateResult> results = [
            SELECT Connection_Type__c, COUNT(Id) cnt
            FROM BPMN_Connection__c
            WHERE Process__c = :processId
            WITH SECURITY_ENFORCED
            GROUP BY Connection_Type__c
        ];
        
        for (AggregateResult ar : results) {
            String connType = (String) ar.get('Connection_Type__c');
            Integer count = (Integer) ar.get('cnt');
            if (connType != null) {
                typeCounts.put(connType, count);
            }
        }
        
        return typeCounts;
    }
    
    /**
     * @description Finds orphaned connections (missing source or target)
     * @param processId - The parent Process ID
     * @return List<BPMN_Connection__c> - Connections with null source or target
     * 
     * Used for data quality validation.
     */
    public static List<BPMN_Connection__c> selectOrphanedConnections(Id processId) {
        if (processId == null) {
            return new List<BPMN_Connection__c>();
        }
        
        return [
            SELECT Id, Name, Connection_Id__c, Source_Element__c, Target_Element__c
            FROM BPMN_Connection__c
            WHERE Process__c = :processId
              AND (Source_Element__c = NULL OR Target_Element__c = NULL)
            WITH SECURITY_ENFORCED
            LIMIT 500
        ];
    }
}
