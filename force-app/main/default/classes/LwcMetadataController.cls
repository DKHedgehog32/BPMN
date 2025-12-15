/**
 * @description Controller for retrieving LWC metadata for BPMN conversion
 * @author Dennis van Musschenbroek (DvM) - Cobra CRM B.V.
 * @date 2024-12-14
 * @version 1.0.0
 * @group Controller
 * 
 * EXPLANATION:
 * This controller queries Lightning Web Components in the org and identifies
 * those configured for use in Flows (lightning__FlowScreen or lightning__FlowAction
 * targets). These components can be represented as User Tasks or Service Tasks
 * in the BPMN modeler.
 * 
 * The controller:
 * - Lists LWC bundles with Flow-related targets
 * - Extracts component configuration (inputs, outputs)
 * - Provides component metadata for BPMN task mapping
 * - Filters by namespace (managed vs custom)
 * 
 * DEPENDENCIES:
 * - LightningComponentBundle (Tooling API)
 * - LightningComponentResource (for js-meta.xml)
 * 
 * ARCHITECTURE:
 * - AWAF Pattern: Controller (API boundary)
 * - Uses Tooling API for component metadata
 * - Parses js-meta.xml for target configuration
 * 
 * CHANGELOG:
 * Version | Date       | Author | Description
 * --------|------------|--------|------------------------------------------
 * 1.0.0   | 2024-12-14 | DvM    | Initial creation - LWC flow component detection
 * 
 * SECURITY:
 * - Sharing: with sharing (respects user permissions)
 * - Requires: View All Data OR Customize Application
 * 
 * GOVERNOR LIMITS CONSIDERATIONS:
 * - Tooling API queries for component bundles
 * - XML parsing for meta files
 * 
 * USAGE:
 * // From LWC via wire
 * @wire(getFlowScreenComponents, { searchTerm: 'custom' })
 * wiredComponents({ error, data }) { ... }
 */
public with sharing class LwcMetadataController {
    
    // =========================================================================
    // INNER CLASSES - Data Transfer Objects
    // =========================================================================
    
    /**
     * @description Wrapper for LWC component list items
     */
    public class LwcComponentItem {
        @AuraEnabled public String id { get; set; }
        @AuraEnabled public String developerName { get; set; }
        @AuraEnabled public String masterLabel { get; set; }
        @AuraEnabled public String description { get; set; }
        @AuraEnabled public String namespacePrefix { get; set; }
        @AuraEnabled public String fullName { get; set; }
        @AuraEnabled public Double apiVersion { get; set; }
        @AuraEnabled public Boolean isExposed { get; set; }
        @AuraEnabled public List<String> targets { get; set; }
        @AuraEnabled public Boolean isFlowScreen { get; set; }
        @AuraEnabled public Boolean isFlowAction { get; set; }
        @AuraEnabled public Datetime lastModifiedDate { get; set; }
        @AuraEnabled public String lastModifiedBy { get; set; }
        @AuraEnabled public List<ComponentProperty> properties { get; set; }
    }
    
    /**
     * @description Wrapper for component @api properties
     */
    public class ComponentProperty {
        @AuraEnabled public String name { get; set; }
        @AuraEnabled public String label { get; set; }
        @AuraEnabled public String type { get; set; }
        @AuraEnabled public String description { get; set; }
        @AuraEnabled public Boolean isRequired { get; set; }
        @AuraEnabled public String defaultValue { get; set; }
        @AuraEnabled public String role { get; set; } // inputOnly, outputOnly, or both
    }
    
    /**
     * @description Full LWC metadata result
     */
    public class LwcMetadataResult {
        @AuraEnabled public String id { get; set; }
        @AuraEnabled public String developerName { get; set; }
        @AuraEnabled public String masterLabel { get; set; }
        @AuraEnabled public String metaXml { get; set; }
        @AuraEnabled public String jsContent { get; set; }
        @AuraEnabled public List<ComponentProperty> inputs { get; set; }
        @AuraEnabled public List<ComponentProperty> outputs { get; set; }
        @AuraEnabled public Boolean success { get; set; }
        @AuraEnabled public String errorMessage { get; set; }
    }
    
    // =========================================================================
    // CONSTANTS
    // =========================================================================
    
    // Flow-related targets we're looking for
    private static final Set<String> FLOW_TARGETS = new Set<String>{
        'lightning__FlowScreen',
        'lightning__FlowAction'
    };
    
    // =========================================================================
    // PUBLIC METHODS - Wire Adapters
    // =========================================================================
    
    /**
     * @description Get list of LWC components available for Flows
     * @param searchTerm Optional search term to filter by name
     * @param includeManaged Include managed package components
     * @return List of LwcComponentItem with Flow targets
     */
    @AuraEnabled(cacheable=true)
    public static List<LwcComponentItem> getFlowScreenComponents(String searchTerm, Boolean includeManaged) {
        List<LwcComponentItem> results = new List<LwcComponentItem>();
        
        try {
            // Query LWC bundles via Tooling API
            String baseUrl = URL.getOrgDomainUrl().toExternalForm();
            String query = 'SELECT Id, DeveloperName, MasterLabel, Description, ' +
                          'NamespacePrefix, ApiVersion, IsExposed, ' +
                          'LastModifiedDate, LastModifiedById ' +
                          'FROM LightningComponentBundle ' +
                          'WHERE IsExposed = true ';
            
            if (String.isNotBlank(searchTerm)) {
                query += 'AND (DeveloperName LIKE \'%' + String.escapeSingleQuotes(searchTerm) + '%\' ' +
                        'OR MasterLabel LIKE \'%' + String.escapeSingleQuotes(searchTerm) + '%\') ';
            }
            
            if (includeManaged != true) {
                query += 'AND NamespacePrefix = null ';
            }
            
            query += 'ORDER BY DeveloperName ASC LIMIT 200';
            
            String toolingUrl = baseUrl + '/services/data/v59.0/tooling/query/?q=' + 
                               EncodingUtil.urlEncode(query, 'UTF-8');
            
            HttpRequest req = new HttpRequest();
            req.setEndpoint(toolingUrl);
            req.setMethod('GET');
            req.setHeader('Authorization', 'Bearer ' + UserInfo.getSessionId());
            req.setHeader('Content-Type', 'application/json');
            req.setTimeout(30000);
            
            Http http = new Http();
            HttpResponse res = http.send(req);
            
            if (res.getStatusCode() == 200) {
                Map<String, Object> responseMap = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
                List<Object> records = (List<Object>) responseMap.get('records');
                
                if (records != null) {
                    for (Object record : records) {
                        Map<String, Object> recordMap = (Map<String, Object>) record;
                        
                        // Get the meta file to check targets
                        String bundleId = (String) recordMap.get('Id');
                        List<String> targets = getComponentTargets(bundleId);
                        
                        // Only include if it has Flow targets
                        Boolean hasFlowTarget = false;
                        for (String target : targets) {
                            if (FLOW_TARGETS.contains(target)) {
                                hasFlowTarget = true;
                                break;
                            }
                        }
                        
                        if (hasFlowTarget) {
                            LwcComponentItem item = new LwcComponentItem();
                            item.id = bundleId;
                            item.developerName = (String) recordMap.get('DeveloperName');
                            item.masterLabel = (String) recordMap.get('MasterLabel');
                            item.description = (String) recordMap.get('Description');
                            item.namespacePrefix = (String) recordMap.get('NamespacePrefix');
                            item.fullName = String.isNotBlank(item.namespacePrefix) 
                                ? item.namespacePrefix + '-' + item.developerName 
                                : 'c-' + item.developerName;
                            item.apiVersion = (Double) recordMap.get('ApiVersion');
                            item.isExposed = (Boolean) recordMap.get('IsExposed');
                            item.targets = targets;
                            item.isFlowScreen = targets.contains('lightning__FlowScreen');
                            item.isFlowAction = targets.contains('lightning__FlowAction');
                            item.properties = new List<ComponentProperty>();
                            
                            results.add(item);
                        }
                    }
                }
            }
            
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Error querying LWC components: ' + e.getMessage());
        }
        
        return results;
    }
    
    /**
     * @description Get all exposed LWC components (not just Flow components)
     * @param searchTerm Search term
     * @return List of LwcComponentItem
     */
    @AuraEnabled(cacheable=true)
    public static List<LwcComponentItem> getAllExposedComponents(String searchTerm) {
        List<LwcComponentItem> results = new List<LwcComponentItem>();
        
        try {
            String baseUrl = URL.getOrgDomainUrl().toExternalForm();
            String query = 'SELECT Id, DeveloperName, MasterLabel, Description, ' +
                          'NamespacePrefix, ApiVersion, IsExposed, ' +
                          'LastModifiedDate ' +
                          'FROM LightningComponentBundle ' +
                          'WHERE IsExposed = true AND NamespacePrefix = null ';
            
            if (String.isNotBlank(searchTerm)) {
                query += 'AND DeveloperName LIKE \'%' + String.escapeSingleQuotes(searchTerm) + '%\' ';
            }
            
            query += 'ORDER BY DeveloperName ASC LIMIT 100';
            
            String toolingUrl = baseUrl + '/services/data/v59.0/tooling/query/?q=' + 
                               EncodingUtil.urlEncode(query, 'UTF-8');
            
            HttpRequest req = new HttpRequest();
            req.setEndpoint(toolingUrl);
            req.setMethod('GET');
            req.setHeader('Authorization', 'Bearer ' + UserInfo.getSessionId());
            req.setHeader('Content-Type', 'application/json');
            req.setTimeout(30000);
            
            Http http = new Http();
            HttpResponse res = http.send(req);
            
            if (res.getStatusCode() == 200) {
                Map<String, Object> responseMap = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
                List<Object> records = (List<Object>) responseMap.get('records');
                
                if (records != null) {
                    for (Object record : records) {
                        Map<String, Object> recordMap = (Map<String, Object>) record;
                        
                        LwcComponentItem item = new LwcComponentItem();
                        item.id = (String) recordMap.get('Id');
                        item.developerName = (String) recordMap.get('DeveloperName');
                        item.masterLabel = (String) recordMap.get('MasterLabel');
                        item.description = (String) recordMap.get('Description');
                        item.namespacePrefix = (String) recordMap.get('NamespacePrefix');
                        item.fullName = 'c-' + item.developerName;
                        item.apiVersion = (Double) recordMap.get('ApiVersion');
                        item.isExposed = true;
                        item.targets = getComponentTargets(item.id);
                        item.isFlowScreen = item.targets.contains('lightning__FlowScreen');
                        item.isFlowAction = item.targets.contains('lightning__FlowAction');
                        item.properties = new List<ComponentProperty>();
                        
                        results.add(item);
                    }
                }
            }
            
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Error querying LWC components: ' + e.getMessage());
        }
        
        return results;
    }
    
    /**
     * @description Get full LWC component metadata including properties
     * @param componentId Salesforce ID of the LWC bundle
     * @return LwcMetadataResult with full metadata
     */
    @AuraEnabled
    public static LwcMetadataResult getLwcMetadata(String componentId) {
        LwcMetadataResult result = new LwcMetadataResult();
        result.success = false;
        result.inputs = new List<ComponentProperty>();
        result.outputs = new List<ComponentProperty>();
        
        if (String.isBlank(componentId)) {
            result.errorMessage = 'Component ID is required';
            return result;
        }
        
        try {
            // Get bundle info
            String baseUrl = URL.getOrgDomainUrl().toExternalForm();
            String query = 'SELECT Id, DeveloperName, MasterLabel ' +
                          'FROM LightningComponentBundle WHERE Id = \'' + 
                          String.escapeSingleQuotes(componentId) + '\'';
            
            String toolingUrl = baseUrl + '/services/data/v59.0/tooling/query/?q=' + 
                               EncodingUtil.urlEncode(query, 'UTF-8');
            
            HttpRequest req = new HttpRequest();
            req.setEndpoint(toolingUrl);
            req.setMethod('GET');
            req.setHeader('Authorization', 'Bearer ' + UserInfo.getSessionId());
            req.setHeader('Content-Type', 'application/json');
            req.setTimeout(30000);
            
            Http http = new Http();
            HttpResponse res = http.send(req);
            
            if (res.getStatusCode() == 200) {
                Map<String, Object> responseMap = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
                List<Object> records = (List<Object>) responseMap.get('records');
                
                if (records != null && !records.isEmpty()) {
                    Map<String, Object> bundle = (Map<String, Object>) records[0];
                    result.id = componentId;
                    result.developerName = (String) bundle.get('DeveloperName');
                    result.masterLabel = (String) bundle.get('MasterLabel');
                    
                    // Get the meta.xml content
                    result.metaXml = getResourceContent(componentId, 'js-meta.xml');
                    
                    // Parse properties from meta.xml
                    if (String.isNotBlank(result.metaXml)) {
                        parseMetaXmlProperties(result);
                    }
                    
                    result.success = true;
                }
            }
            
            if (!result.success && String.isBlank(result.errorMessage)) {
                result.errorMessage = 'Component not found';
            }
            
        } catch (Exception e) {
            result.errorMessage = 'Error retrieving component: ' + e.getMessage();
        }
        
        return result;
    }
    
    // =========================================================================
    // PRIVATE METHODS
    // =========================================================================
    
    /**
     * @description Get component targets from js-meta.xml
     */
    private static List<String> getComponentTargets(String bundleId) {
        List<String> targets = new List<String>();
        
        try {
            String metaXml = getResourceContent(bundleId, 'js-meta.xml');
            
            if (String.isNotBlank(metaXml)) {
                // Parse targets from XML
                // Look for <targets><target>lightning__FlowScreen</target></targets>
                Pattern targetPattern = Pattern.compile('<target>([^<]+)</target>');
                Matcher targetMatcher = targetPattern.matcher(metaXml);
                
                while (targetMatcher.find()) {
                    targets.add(targetMatcher.group(1));
                }
            }
            
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'Could not get targets for bundle ' + bundleId + ': ' + e.getMessage());
        }
        
        return targets;
    }
    
    /**
     * @description Get resource content from LWC bundle
     */
    private static String getResourceContent(String bundleId, String resourceSuffix) {
        String content = '';
        
        try {
            String baseUrl = URL.getOrgDomainUrl().toExternalForm();
            String query = 'SELECT Source FROM LightningComponentResource ' +
                          'WHERE LightningComponentBundleId = \'' + String.escapeSingleQuotes(bundleId) + '\' ' +
                          'AND FilePath LIKE \'%' + String.escapeSingleQuotes(resourceSuffix) + '\'';
            
            String toolingUrl = baseUrl + '/services/data/v59.0/tooling/query/?q=' + 
                               EncodingUtil.urlEncode(query, 'UTF-8');
            
            HttpRequest req = new HttpRequest();
            req.setEndpoint(toolingUrl);
            req.setMethod('GET');
            req.setHeader('Authorization', 'Bearer ' + UserInfo.getSessionId());
            req.setHeader('Content-Type', 'application/json');
            req.setTimeout(30000);
            
            Http http = new Http();
            HttpResponse res = http.send(req);
            
            if (res.getStatusCode() == 200) {
                Map<String, Object> responseMap = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
                List<Object> records = (List<Object>) responseMap.get('records');
                
                if (records != null && !records.isEmpty()) {
                    Map<String, Object> resource = (Map<String, Object>) records[0];
                    content = (String) resource.get('Source');
                }
            }
            
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Error getting resource: ' + e.getMessage());
        }
        
        return content;
    }
    
    /**
     * @description Parse properties from js-meta.xml for Flow configuration
     */
    private static void parseMetaXmlProperties(LwcMetadataResult result) {
        String xml = result.metaXml;
        
        // Find targetConfig for FlowScreen
        // Pattern: <targetConfig targets="lightning__FlowScreen">...</targetConfig>
        Pattern configPattern = Pattern.compile(
            '<targetConfig[^>]*targets="[^"]*lightning__FlowScreen[^"]*"[^>]*>(.*?)</targetConfig>'
        );
        Matcher configMatcher = configPattern.matcher(xml.replaceAll('\\s+', ' '));
        
        if (configMatcher.find()) {
            String configContent = configMatcher.group(1);
            
            // Parse property elements
            // <property name="inputValue" type="String" label="Input Value" role="inputOnly"/>
            Pattern propPattern = Pattern.compile(
                '<property\\s+([^>]*?)/?>'
            );
            Matcher propMatcher = propPattern.matcher(configContent);
            
            while (propMatcher.find()) {
                String propAttrs = propMatcher.group(1);
                ComponentProperty prop = new ComponentProperty();
                
                prop.name = extractAttribute(propAttrs, 'name');
                prop.label = extractAttribute(propAttrs, 'label');
                prop.type = extractAttribute(propAttrs, 'type');
                prop.description = extractAttribute(propAttrs, 'description');
                prop.role = extractAttribute(propAttrs, 'role');
                prop.isRequired = 'true'.equalsIgnoreCase(extractAttribute(propAttrs, 'required'));
                prop.defaultValue = extractAttribute(propAttrs, 'default');
                
                // Categorize by role
                if ('outputOnly'.equalsIgnoreCase(prop.role)) {
                    result.outputs.add(prop);
                } else {
                    result.inputs.add(prop);
                }
            }
        }
    }
    
    /**
     * @description Extract attribute value from XML attribute string
     */
    private static String extractAttribute(String attrs, String attrName) {
        Pattern attrPattern = Pattern.compile(attrName + '="([^"]*)"');
        Matcher attrMatcher = attrPattern.matcher(attrs);
        
        if (attrMatcher.find()) {
            return attrMatcher.group(1);
        }
        
        return null;
    }
}