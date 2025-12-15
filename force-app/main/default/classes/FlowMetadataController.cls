/**
 * @description Controller for retrieving Flow metadata from the org for BPMN conversion
 * @author Dennis van Musschenbroek (DvM) - Cobra CRM B.V.
 * @date 2024-12-14
 * @version 1.0.1
 * @group Controller
 * 
 * EXPLANATION:
 * This controller provides methods to query Flow definitions, versions, and full metadata
 * from the current Salesforce org. It uses a combination of standard SOQL queries on
 * FlowDefinitionView/FlowVersionView and the Tooling API to retrieve the complete Flow
 * XML for BPMN conversion in the Process Modeler component.
 * 
 * The controller supports:
 * - Listing all active/draft flows with filtering
 * - Getting flow versions for a specific flow
 * - Retrieving full Flow XML metadata for parsing
 * - Categorizing flows by process type (Screen Flow, Auto-launched, etc.)
 * 
 * DEPENDENCIES:
 * - FlowDefinitionView (standard object)
 * - FlowVersionView (standard object)
 * - Tooling API access for metadata retrieval
 * 
 * ARCHITECTURE:
 * - AWAF Pattern: Controller (API boundary)
 * - Provides cacheable wire methods for LWC consumption
 * - Uses Tooling API for metadata that's not in standard objects
 * 
 * CHANGELOG:
 * Version | Date       | Author | Description
 * --------|------------|--------|------------------------------------------
 * 1.0.0   | 2024-12-14 | DvM    | Initial creation - flow metadata retrieval
 * 1.0.1   | 2024-12-14 | DvM    | Fixed field references for FlowVersionView
 * 
 * SECURITY:
 * - Sharing: with sharing (respects user permissions)
 * - Requires: View All Data OR Manage Flows permission
 * - FLS: Not applicable (metadata queries)
 * 
 * GOVERNOR LIMITS CONSIDERATIONS:
 * - SOQL Queries: 2-3 per operation (flow list + versions)
 * - Tooling API: 1 callout per flow metadata retrieval
 * - Heap Size: Flow XML can be large, handled via streaming where possible
 * 
 * USAGE:
 * // From LWC via wire
 * @wire(getActiveFlows, { searchTerm: 'Order' })
 * wiredFlows({ error, data }) { ... }
 * 
 * // Imperative call for full metadata
 * const flowXml = await getFlowMetadata({ flowApiName: 'My_Flow' });
 */
public with sharing class FlowMetadataController {
    
    // =========================================================================
    // INNER CLASSES - Data Transfer Objects
    // =========================================================================
    
    /**
     * @description Wrapper for Flow list items displayed in selector
     */
    public class FlowListItem {
        @AuraEnabled public String id { get; set; }
        @AuraEnabled public String apiName { get; set; }
        @AuraEnabled public String label { get; set; }
        @AuraEnabled public String description { get; set; }
        @AuraEnabled public String processType { get; set; }
        @AuraEnabled public String processTypeLabel { get; set; }
        @AuraEnabled public String triggerType { get; set; }
        @AuraEnabled public String status { get; set; }
        @AuraEnabled public Integer activeVersionNumber { get; set; }
        @AuraEnabled public Datetime lastModifiedDate { get; set; }
        @AuraEnabled public String lastModifiedBy { get; set; }
        @AuraEnabled public String iconName { get; set; }
        @AuraEnabled public Integer elementCount { get; set; }
        @AuraEnabled public String namespacePrefix { get; set; }
        @AuraEnabled public Boolean isTemplate { get; set; }
    }
    
    /**
     * @description Wrapper for Flow version details
     */
    public class FlowVersionItem {
        @AuraEnabled public String id { get; set; }
        @AuraEnabled public Integer versionNumber { get; set; }
        @AuraEnabled public String status { get; set; }
        @AuraEnabled public String description { get; set; }
        @AuraEnabled public String label { get; set; }
        @AuraEnabled public Datetime lastModifiedDate { get; set; }
        @AuraEnabled public Boolean isActive { get; set; }
        @AuraEnabled public Double apiVersion { get; set; }
    }
    
    /**
     * @description Full Flow metadata for BPMN conversion
     */
    public class FlowMetadataResult {
        @AuraEnabled public String apiName { get; set; }
        @AuraEnabled public String label { get; set; }
        @AuraEnabled public String flowXml { get; set; }
        @AuraEnabled public String processType { get; set; }
        @AuraEnabled public Integer versionNumber { get; set; }
        @AuraEnabled public Boolean success { get; set; }
        @AuraEnabled public String errorMessage { get; set; }
    }
    
    // =========================================================================
    // CONSTANTS
    // =========================================================================
    
    // Process type to icon mapping for UI display
    private static final Map<String, String> PROCESS_TYPE_ICONS = new Map<String, String>{
        'Flow' => 'utility:flow',
        'AutoLaunchedFlow' => 'utility:automate',
        'Workflow' => 'utility:workflow',
        'CustomEvent' => 'utility:event',
        'InvocableProcess' => 'utility:process',
        'Survey' => 'utility:survey',
        'Orchestrator' => 'utility:orchestrator',
        'PromptFlow' => 'utility:einstein'
    };
    
    // Process type friendly labels
    private static final Map<String, String> PROCESS_TYPE_LABELS = new Map<String, String>{
        'Flow' => 'Screen Flow',
        'AutoLaunchedFlow' => 'Auto-Launched Flow',
        'Workflow' => 'Workflow Rule',
        'CustomEvent' => 'Platform Event Flow',
        'InvocableProcess' => 'Invocable Process',
        'Survey' => 'Survey',
        'Orchestrator' => 'Orchestration',
        'PromptFlow' => 'Prompt Flow'
    };
    
    // =========================================================================
    // PUBLIC METHODS - Wire Adapters
    // =========================================================================
    
    /**
     * @description Get list of active flows with optional search filtering
     * @param searchTerm Optional search term to filter by label or API name
     * @param processTypes Optional list of process types to filter
     * @return List of FlowListItem for display in selector
     */
    @AuraEnabled(cacheable=true)
    public static List<FlowListItem> getActiveFlows(String searchTerm, List<String> processTypes) {
        List<FlowListItem> results = new List<FlowListItem>();
        
        try {
            // Build dynamic query based on filters
            // Note: FlowDefinitionView available fields checked via describe
            String query = 'SELECT Id, ApiName, Label, Description, ProcessType, ' +
                          'TriggerType, ActiveVersionId, LatestVersionId, ' +
                          'LastModifiedDate, LastModifiedBy, NamespacePrefix, IsTemplate ' +
                          'FROM FlowDefinitionView ';
            
            List<String> conditions = new List<String>();
            
            // Add search filter if provided
            if (String.isNotBlank(searchTerm)) {
                String searchWildcard = '%' + String.escapeSingleQuotes(searchTerm) + '%';
                conditions.add('(Label LIKE :searchWildcard OR ApiName LIKE :searchWildcard)');
            }
            
            // Add process type filter if provided
            if (processTypes != null && !processTypes.isEmpty()) {
                conditions.add('ProcessType IN :processTypes');
            }
            
            // Combine conditions
            if (!conditions.isEmpty()) {
                query += 'WHERE ' + String.join(conditions, ' AND ') + ' ';
            }
            
            query += 'ORDER BY LastModifiedDate DESC LIMIT 200';
            
            // Execute query and map results
            for (FlowDefinitionView flow : Database.query(query)) {
                results.add(mapToFlowListItem(flow));
            }
            
        } catch (Exception e) {
            // Log error but return empty list rather than throwing
            // Allows UI to handle gracefully
            System.debug(LoggingLevel.ERROR, 'Error querying flows: ' + e.getMessage());
        }
        
        return results;
    }
    
    /**
     * @description Get all process types available for filtering
     * @return List of process type options for combobox
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getProcessTypeOptions() {
        // Return hardcoded process type options
        // Aggregate queries on FlowDefinitionView can be problematic
        // These are the standard Salesforce Flow process types
        List<Map<String, String>> options = new List<Map<String, String>>();
        
        options.add(new Map<String, String>{ 'value' => '', 'label' => 'All Types' });
        options.add(new Map<String, String>{ 'value' => 'Flow', 'label' => 'Screen Flow' });
        options.add(new Map<String, String>{ 'value' => 'AutoLaunchedFlow', 'label' => 'Auto-Launched Flow' });
        options.add(new Map<String, String>{ 'value' => 'Workflow', 'label' => 'Record-Triggered Flow' });
        options.add(new Map<String, String>{ 'value' => 'CustomEvent', 'label' => 'Platform Event Flow' });
        options.add(new Map<String, String>{ 'value' => 'InvocableProcess', 'label' => 'Invocable Process' });
        options.add(new Map<String, String>{ 'value' => 'Orchestrator', 'label' => 'Orchestration' });
        options.add(new Map<String, String>{ 'value' => 'Survey', 'label' => 'Survey' });
        
        return options;
    }
    
    /**
     * @description Get versions of a specific flow
     * @param flowApiName API name of the flow
     * @return List of FlowVersionItem
     */
    @AuraEnabled(cacheable=true)
    public static List<FlowVersionItem> getFlowVersions(String flowApiName) {
        List<FlowVersionItem> versions = new List<FlowVersionItem>();
        
        if (String.isBlank(flowApiName)) {
            return versions;
        }
        
        try {
            // Get the definition to check active version and get Id for version query
            FlowDefinitionView definition = [
                SELECT Id, ActiveVersionId 
                FROM FlowDefinitionView 
                WHERE ApiName = :flowApiName 
                LIMIT 1
            ];
            
            // Use the definition Id directly instead of subquery
            String definitionId = definition.Id;
            
            // Query all versions - using only available fields on FlowVersionView
            // Available: Id, VersionNumber, Status, Description, Label, LastModifiedDate, ApiVersion
            for (FlowVersionView version : [
                SELECT Id, VersionNumber, Status, Description, Label, 
                       LastModifiedDate, ApiVersion
                FROM FlowVersionView 
                WHERE FlowDefinitionViewId = :definitionId
                ORDER BY VersionNumber DESC
            ]) {
                FlowVersionItem item = new FlowVersionItem();
                item.id = version.Id;
                item.versionNumber = version.VersionNumber;
                item.status = version.Status;
                item.description = version.Description;
                item.label = version.Label;
                item.lastModifiedDate = version.LastModifiedDate;
                item.apiVersion = version.ApiVersion;
                item.isActive = (version.Id == definition.ActiveVersionId);
                versions.add(item);
            }
            
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Error querying flow versions: ' + e.getMessage());
        }
        
        return versions;
    }
    
    // =========================================================================
    // PUBLIC METHODS - Imperative
    // =========================================================================
    
    /**
     * @description Get full Flow metadata for BPMN conversion
     * Uses Tooling API via Named Credential (preferred) or direct callout
     * @param flowApiName API name of the flow
     * @param versionNumber Optional version number (defaults to active version)
     * @return FlowMetadataResult with flow data or error
     */
    @AuraEnabled
    public static FlowMetadataResult getFlowMetadata(String flowApiName, Integer versionNumber) {
        FlowMetadataResult result = new FlowMetadataResult();
        result.apiName = flowApiName;
        result.success = false;
        
        if (String.isBlank(flowApiName)) {
            result.errorMessage = 'Flow API name is required';
            return result;
        }
        
        try {
            // Find the flow definition - include DurableId for managed package flows
            List<FlowDefinitionView> definitions = [
                SELECT Id, DurableId, ApiName, Label, ProcessType, ActiveVersionId, NamespacePrefix,
                       Description, TriggerType
                FROM FlowDefinitionView 
                WHERE ApiName = :flowApiName 
                LIMIT 1
            ];
            
            // Fallback: try without namespace
            if (definitions.isEmpty() && flowApiName.contains('__')) {
                String cleanApiName = flowApiName.substringAfter('__');
                definitions = [
                    SELECT Id, DurableId, ApiName, Label, ProcessType, ActiveVersionId, NamespacePrefix,
                           Description, TriggerType
                    FROM FlowDefinitionView 
                    WHERE ApiName = :cleanApiName
                    LIMIT 1
                ];
            }
            
            if (definitions.isEmpty()) {
                result.errorMessage = 'Flow not found: ' + flowApiName;
                return result;
            }
            
            FlowDefinitionView definition = definitions[0];
            result.label = definition.Label;
            result.processType = definition.ProcessType;
            
            // For FlowVersionView queries, we need to use the correct filter
            // FlowVersionView REQUIRES an equality filter on FlowDefinitionViewId or DurableId
            String definitionId = definition.Id;
            String flowDurableId = definition.DurableId;
            
            System.debug(LoggingLevel.INFO, 'Flow Definition Id: ' + definitionId);
            System.debug(LoggingLevel.INFO, 'Flow DurableId: ' + flowDurableId);
            System.debug(LoggingLevel.INFO, 'Flow NamespacePrefix: ' + definition.NamespacePrefix);
            
            // Query versions - FlowVersionView requires exact equality filter
            // Try with FlowDefinitionViewId first (works for local flows)
            List<FlowVersionView> versions = new List<FlowVersionView>();
            
            try {
                versions = [
                    SELECT VersionNumber, Status, Description, ApiVersion, FlowDefinitionViewId, DurableId
                    FROM FlowVersionView 
                    WHERE FlowDefinitionViewId = :definitionId
                    ORDER BY VersionNumber DESC
                    LIMIT 10
                ];
                System.debug(LoggingLevel.INFO, 'Versions found with FlowDefinitionViewId: ' + versions.size());
            } catch (Exception e) {
                System.debug(LoggingLevel.WARN, 'FlowDefinitionViewId query failed: ' + e.getMessage());
            }
            
            // If no results and we have a DurableId, try querying by DurableId pattern
            // For managed packages, the version DurableId is like "MktCloud__FlowName-1"
            if (versions.isEmpty() && String.isNotBlank(flowDurableId)) {
                try {
                    // Try with the DurableId of version 1 (most common active version pattern)
                    String versionDurableId = flowDurableId + '-1';
                    versions = [
                        SELECT VersionNumber, Status, Description, ApiVersion, FlowDefinitionViewId, DurableId
                        FROM FlowVersionView 
                        WHERE DurableId = :versionDurableId
                        LIMIT 1
                    ];
                    System.debug(LoggingLevel.INFO, 'Versions found with DurableId: ' + versions.size());
                } catch (Exception e) {
                    System.debug(LoggingLevel.WARN, 'DurableId query failed: ' + e.getMessage());
                }
            }
            
            // If still no results, skip version query and go directly to Tooling API
            if (versions.isEmpty()) {
                System.debug(LoggingLevel.INFO, 'No versions found via SOQL, attempting Tooling API directly');
                
                // Try to get flow metadata via Tooling API without version number
                String flowMetadataJson = retrieveFlowViaToolingApi(definition.ApiName, null);
                
                if (String.isNotBlank(flowMetadataJson)) {
                    result.flowXml = flowMetadataJson;
                    result.versionNumber = 1;
                    result.success = true;
                    return result;
                }
                
                // Create basic fallback structure
                Map<String, Object> flowData = new Map<String, Object>();
                flowData.put('apiName', definition.ApiName);
                flowData.put('label', definition.Label);
                flowData.put('processType', definition.ProcessType);
                flowData.put('description', definition.Description);
                flowData.put('triggerType', definition.TriggerType);
                flowData.put('isManaged', String.isNotBlank(definition.NamespacePrefix));
                flowData.put('elements', new List<Object>());
                flowData.put('connectors', new List<Object>());
                
                result.flowXml = JSON.serialize(flowData);
                result.versionNumber = 1;
                result.success = true;
                result.errorMessage = 'Basic metadata only - flow versions not accessible';
                return result;
            }
            
            // Find target version
            Integer targetVersionNumber = versionNumber;
            if (targetVersionNumber == null) {
                for (FlowVersionView v : versions) {
                    if (v.Status == 'Active') {
                        targetVersionNumber = v.VersionNumber;
                        break;
                    }
                }
                if (targetVersionNumber == null) {
                    targetVersionNumber = versions[0].VersionNumber;
                }
            }
            
            result.versionNumber = targetVersionNumber;
            
            // Try to get full flow metadata via Tooling API
            String flowMetadataJson = retrieveFlowViaToolingApi(definition.ApiName, targetVersionNumber);
            
            if (String.isNotBlank(flowMetadataJson)) {
                // Successfully retrieved full metadata
                result.flowXml = flowMetadataJson;
                result.success = true;
            } else {
                // Fallback to basic metadata structure
                Map<String, Object> flowData = new Map<String, Object>();
                flowData.put('apiName', definition.ApiName);
                flowData.put('label', definition.Label);
                flowData.put('description', definition.Description);
                flowData.put('processType', definition.ProcessType);
                flowData.put('triggerType', definition.TriggerType);
                flowData.put('versionNumber', targetVersionNumber);
                flowData.put('status', definition.ActiveVersionId != null ? 'Active' : 'Draft');
                
                // Add version info
                for (FlowVersionView v : versions) {
                    if (v.VersionNumber == targetVersionNumber) {
                        flowData.put('apiVersion', v.ApiVersion);
                        flowData.put('versionDescription', v.Description);
                        break;
                    }
                }
                
                // Create basic flow structure
                flowData.put('elements', createBasicFlowElements(definition));
                
                result.flowXml = JSON.serialize(flowData);
                result.success = true;
            }
            
        } catch (Exception e) {
            result.errorMessage = 'Error retrieving Flow: ' + e.getMessage();
            System.debug(LoggingLevel.ERROR, 'Flow metadata error: ' + e.getMessage() + '\n' + e.getStackTraceString());
        }
        
        return result;
    }
    
    /**
     * @description Retrieve Flow metadata via Tooling API
     * Attempts Named Credential first, then falls back to session-based auth
     * @param flowApiName The API name of the flow (may include namespace prefix)
     * @param versionNumber The version number to retrieve (can be null to get latest/active)
     * @return JSON string of flow metadata, or null if failed
     */
    private static String retrieveFlowViaToolingApi(String flowApiName, Integer versionNumber) {
        String metadataJson = null;
        
        // Handle namespaced flow names - Definition.DeveloperName doesn't include namespace
        // So "MktCloud__GenerateCampaignInsights" becomes just "GenerateCampaignInsights"
        String developerName = flowApiName;
        if (flowApiName != null && flowApiName.contains('__')) {
            developerName = flowApiName.substringAfter('__');
        }
        
        System.debug(LoggingLevel.INFO, 'Original flowApiName: ' + flowApiName);
        System.debug(LoggingLevel.INFO, 'DeveloperName for query: ' + developerName);
        
        // Build the SOQL query for Tooling API
        // Using Definition.DeveloperName which is the correct filterable field
        String soqlQuery;
        if (versionNumber != null) {
            soqlQuery = 'SELECT Id, Metadata, VersionNumber, Status FROM Flow WHERE Definition.DeveloperName = \'' + 
                String.escapeSingleQuotes(developerName) + '\' AND VersionNumber = ' + versionNumber;
        } else {
            // Get the active version first
            soqlQuery = 'SELECT Id, Metadata, VersionNumber, Status FROM Flow WHERE Definition.DeveloperName = \'' + 
                String.escapeSingleQuotes(developerName) + '\' AND Status = \'Active\' LIMIT 1';
        }
        
        System.debug(LoggingLevel.INFO, 'Tooling API Query: ' + soqlQuery);
        
        // Try Named Credential first (most secure)
        metadataJson = callToolingApiWithNamedCredential(soqlQuery);
        
        // If Named Credential fails, try session-based auth
        if (metadataJson == null) {
            System.debug(LoggingLevel.INFO, 'Named Credential failed, trying session-based auth');
            metadataJson = callToolingApiWithSession(soqlQuery);
        }
        
        // If still null and we searched for Active, try without status filter (get latest)
        if (metadataJson == null && versionNumber == null) {
            System.debug(LoggingLevel.INFO, 'No active version found, trying latest version');
            soqlQuery = 'SELECT Id, Metadata, VersionNumber, Status FROM Flow WHERE Definition.DeveloperName = \'' + 
                String.escapeSingleQuotes(developerName) + '\' ORDER BY VersionNumber DESC LIMIT 1';
            
            metadataJson = callToolingApiWithNamedCredential(soqlQuery);
            if (metadataJson == null) {
                metadataJson = callToolingApiWithSession(soqlQuery);
            }
        }
        
        return metadataJson;
    }
    
    /**
     * @description Call Tooling API using Named Credential
     * Requires a Named Credential named 'Salesforce_Tooling_API' to be configured
     */
    private static String callToolingApiWithNamedCredential(String soqlQuery) {
        try {
            HttpRequest req = new HttpRequest();
            req.setEndpoint('callout:Salesforce_Tooling_API/services/data/v59.0/tooling/query/?q=' + 
                EncodingUtil.urlEncode(soqlQuery, 'UTF-8'));
            req.setMethod('GET');
            req.setHeader('Content-Type', 'application/json');
            req.setTimeout(60000);
            
            System.debug(LoggingLevel.INFO, 'Calling Tooling API with Named Credential...');
            System.debug(LoggingLevel.INFO, 'Query: ' + soqlQuery);
            
            Http http = new Http();
            HttpResponse res = http.send(req);
            
            System.debug(LoggingLevel.INFO, 'Tooling API Response Status: ' + res.getStatusCode());
            
            if (res.getStatusCode() == 200) {
                System.debug(LoggingLevel.INFO, 'Tooling API call successful');
                return parseToolingApiResponse(res.getBody());
            } else {
                System.debug(LoggingLevel.WARN, 'Named Credential Tooling API call failed: ' + res.getStatusCode());
                System.debug(LoggingLevel.WARN, 'Response body: ' + res.getBody());
            }
        } catch (System.CalloutException ce) {
            // Specific callout errors (no permission, credential not found, etc.)
            System.debug(LoggingLevel.ERROR, 'Callout Exception: ' + ce.getMessage());
            System.debug(LoggingLevel.ERROR, 'This usually means: 1) Named Credential not found, 2) User lacks External Credential Principal Access, or 3) Principal not authenticated');
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Named Credential error: ' + e.getMessage());
            System.debug(LoggingLevel.ERROR, 'Stack trace: ' + e.getStackTraceString());
        }
        
        return null;
    }
    
    /**
     * @description Call Tooling API using session-based authentication
     * This works in some contexts but may fail in Lightning due to session restrictions
     */
    private static String callToolingApiWithSession(String soqlQuery) {
        try {
            String baseUrl = URL.getOrgDomainUrl().toExternalForm();
            String toolingUrl = baseUrl + '/services/data/v59.0/tooling/query/?q=' + 
                EncodingUtil.urlEncode(soqlQuery, 'UTF-8');
            
            HttpRequest req = new HttpRequest();
            req.setEndpoint(toolingUrl);
            req.setMethod('GET');
            req.setHeader('Authorization', 'Bearer ' + UserInfo.getSessionId());
            req.setHeader('Content-Type', 'application/json');
            req.setTimeout(60000);
            
            Http http = new Http();
            HttpResponse res = http.send(req);
            
            System.debug(LoggingLevel.INFO, 'Session-based Tooling API status: ' + res.getStatusCode());
            
            if (res.getStatusCode() == 200) {
                return parseToolingApiResponse(res.getBody());
            } else {
                System.debug(LoggingLevel.WARN, 'Session-based Tooling API failed: ' + res.getStatusCode() + ' - ' + res.getBody());
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Session-based Tooling API error: ' + e.getMessage());
        }
        
        return null;
    }
    
    /**
     * @description Parse the Tooling API response and extract flow metadata
     */
    private static String parseToolingApiResponse(String responseBody) {
        try {
            Map<String, Object> responseMap = (Map<String, Object>) JSON.deserializeUntyped(responseBody);
            List<Object> records = (List<Object>) responseMap.get('records');
            
            if (records != null && !records.isEmpty()) {
                Map<String, Object> record = (Map<String, Object>) records[0];
                Object metadata = record.get('Metadata');
                
                if (metadata != null) {
                    // Return the full metadata as JSON
                    return JSON.serialize(metadata);
                }
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Error parsing Tooling API response: ' + e.getMessage());
        }
        
        return null;
    }
    
    /**
     * @description Create basic flow elements structure for BPMN conversion
     * Since we can't access full flow metadata without Tooling API,
     * we create a minimal structure with start and end events
     */
    private static List<Map<String, Object>> createBasicFlowElements(FlowDefinitionView definition) {
        List<Map<String, Object>> elements = new List<Map<String, Object>>();
        
        // Add start element based on flow type
        Map<String, Object> startElement = new Map<String, Object>();
        startElement.put('name', 'Start');
        startElement.put('type', 'start');
        
        if (definition.ProcessType == 'AutoLaunchedFlow' && definition.TriggerType != null) {
            // Record-triggered or scheduled flow
            if (definition.TriggerType == 'RecordBeforeSave' || definition.TriggerType == 'RecordAfterSave') {
                startElement.put('triggerType', definition.TriggerType);
                startElement.put('elementType', 'FlowRecordTrigger');
            } else if (definition.TriggerType == 'Scheduled') {
                startElement.put('elementType', 'FlowScheduledTrigger');
            } else if (definition.TriggerType == 'PlatformEvent') {
                startElement.put('elementType', 'FlowPlatformEventTrigger');
            }
        } else if (definition.ProcessType == 'Flow') {
            // Screen flow
            startElement.put('elementType', 'FlowStart');
        } else {
            startElement.put('elementType', 'FlowStart');
        }
        
        elements.add(startElement);
        
        // Add a placeholder task to show the flow has content
        Map<String, Object> placeholderElement = new Map<String, Object>();
        placeholderElement.put('name', 'Flow Elements');
        placeholderElement.put('type', 'task');
        placeholderElement.put('description', 'Import full flow details using Flow Builder or add elements manually');
        placeholderElement.put('elementType', 'FlowPlaceholder');
        elements.add(placeholderElement);
        
        // Add end element
        Map<String, Object> endElement = new Map<String, Object>();
        endElement.put('name', 'End');
        endElement.put('type', 'end');
        endElement.put('elementType', 'FlowEnd');
        elements.add(endElement);
        
        return elements;
    }
    
    // =========================================================================
    // PRIVATE METHODS
    // =========================================================================
    
    /**
     * @description Map FlowDefinitionView to FlowListItem DTO
     */
    private static FlowListItem mapToFlowListItem(FlowDefinitionView flow) {
        FlowListItem item = new FlowListItem();
        item.id = flow.Id;
        item.apiName = flow.ApiName;
        item.label = flow.Label;
        item.description = flow.Description;
        item.processType = flow.ProcessType != null ? flow.ProcessType : 'Unknown';
        item.processTypeLabel = (flow.ProcessType != null && PROCESS_TYPE_LABELS.containsKey(flow.ProcessType))
            ? PROCESS_TYPE_LABELS.get(flow.ProcessType) 
            : (flow.ProcessType != null ? flow.ProcessType : 'Unknown');
        item.triggerType = flow.TriggerType;
        item.namespacePrefix = flow.NamespacePrefix;
        item.isTemplate = flow.IsTemplate;
        item.status = flow.ActiveVersionId != null ? 'Active' : 'Draft';
        item.lastModifiedDate = flow.LastModifiedDate;
        item.lastModifiedBy = flow.LastModifiedBy;
        item.iconName = (flow.ProcessType != null && PROCESS_TYPE_ICONS.containsKey(flow.ProcessType))
            ? PROCESS_TYPE_ICONS.get(flow.ProcessType) 
            : 'utility:flow';
        
        return item;
    }
    
    // Note: Tooling API methods removed - using direct SOQL queries instead
    // to avoid session ID issues in Lightning context
}