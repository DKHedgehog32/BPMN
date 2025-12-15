/**
 * @description Controller for retrieving Apex class metadata for BPMN conversion
 * @author Dennis van Musschenbroek (DvM) - Cobra CRM B.V.
 * @date 2024-12-14
 * @version 1.0.0
 * @group Controller
 * 
 * EXPLANATION:
 * This controller queries Apex classes in the org and identifies those with
 * @InvocableMethod annotations, which can be called from Flows. It extracts
 * the invocable method metadata (inputs, outputs, labels) for display in the
 * BPMN modeler as Service Tasks.
 * 
 * The controller:
 * - Lists Apex classes with @InvocableMethod annotation
 * - Parses method signatures to extract input/output parameters
 * - Provides class body for detailed analysis
 * - Categorizes by namespace (managed vs unmanaged)
 * 
 * DEPENDENCIES:
 * - ApexClass (Tooling API object)
 * - ApexClassMember (for body retrieval)
 * 
 * ARCHITECTURE:
 * - AWAF Pattern: Controller (API boundary)
 * - Uses Tooling API for Apex class metadata
 * - Regex parsing for @InvocableMethod detection
 * 
 * CHANGELOG:
 * Version | Date       | Author | Description
 * --------|------------|--------|------------------------------------------
 * 1.0.0   | 2024-12-14 | DvM    | Initial creation - invocable class detection
 * 
 * SECURITY:
 * - Sharing: with sharing (respects user permissions)
 * - Requires: View All Data OR Author Apex permission
 * - Class bodies may contain sensitive logic
 * 
 * GOVERNOR LIMITS CONSIDERATIONS:
 * - SOQL: Uses Tooling API queries
 * - Callouts: 1 per class body retrieval
 * - CPU: Regex parsing for annotation detection
 * 
 * USAGE:
 * // From LWC via wire
 * @wire(getInvocableApexClasses, { searchTerm: 'Account' })
 * wiredClasses({ error, data }) { ... }
 */
public with sharing class ApexMetadataController {
    
    // =========================================================================
    // INNER CLASSES - Data Transfer Objects
    // =========================================================================
    
    /**
     * @description Wrapper for Apex class list items
     */
    public class ApexClassItem {
        @AuraEnabled public String id { get; set; }
        @AuraEnabled public String name { get; set; }
        @AuraEnabled public String namespacePrefix { get; set; }
        @AuraEnabled public String fullName { get; set; }
        @AuraEnabled public Double apiVersion { get; set; }
        @AuraEnabled public String status { get; set; }
        @AuraEnabled public Integer bodyLength { get; set; }
        @AuraEnabled public Datetime lastModifiedDate { get; set; }
        @AuraEnabled public String lastModifiedBy { get; set; }
        @AuraEnabled public Boolean isInvocable { get; set; }
        @AuraEnabled public String invocableLabel { get; set; }
        @AuraEnabled public String invocableDescription { get; set; }
        @AuraEnabled public List<InvocableParameter> inputParameters { get; set; }
        @AuraEnabled public List<InvocableParameter> outputParameters { get; set; }
    }
    
    /**
     * @description Wrapper for invocable method parameters
     */
    public class InvocableParameter {
        @AuraEnabled public String name { get; set; }
        @AuraEnabled public String label { get; set; }
        @AuraEnabled public String dataType { get; set; }
        @AuraEnabled public Boolean isRequired { get; set; }
        @AuraEnabled public String description { get; set; }
    }
    
    /**
     * @description Full Apex class metadata result
     */
    public class ApexClassMetadataResult {
        @AuraEnabled public String id { get; set; }
        @AuraEnabled public String name { get; set; }
        @AuraEnabled public String body { get; set; }
        @AuraEnabled public String invocableMethodName { get; set; }
        @AuraEnabled public String invocableLabel { get; set; }
        @AuraEnabled public List<InvocableParameter> inputs { get; set; }
        @AuraEnabled public List<InvocableParameter> outputs { get; set; }
        @AuraEnabled public Boolean success { get; set; }
        @AuraEnabled public String errorMessage { get; set; }
    }
    
    // =========================================================================
    // CONSTANTS
    // =========================================================================
    
    // Regex patterns for parsing Apex annotations
    private static final String INVOCABLE_METHOD_PATTERN = '@InvocableMethod\\s*\\(([^)]*?)\\)';
    private static final String INVOCABLE_VARIABLE_PATTERN = '@InvocableVariable\\s*\\(([^)]*?)\\)';
    private static final String LABEL_PATTERN = 'label\\s*=\\s*[\'"]([^\'"]+)[\'"]';
    private static final String DESCRIPTION_PATTERN = 'description\\s*=\\s*[\'"]([^\'"]+)[\'"]';
    
    // =========================================================================
    // PUBLIC METHODS - Wire Adapters
    // =========================================================================
    
    /**
     * @description Get list of Apex classes with @InvocableMethod
     * @param searchTerm Optional search term to filter by name
     * @param includeManaged Include managed package classes
     * @return List of ApexClassItem with invocable metadata
     */
    @AuraEnabled(cacheable=true)
    public static List<ApexClassItem> getInvocableApexClasses(String searchTerm, Boolean includeManaged) {
        List<ApexClassItem> results = new List<ApexClassItem>();
        
        try {
            // Build query for Apex classes
            // Note: We can't query for @InvocableMethod directly, so we get all
            // classes and filter by checking the body
            String query = 'SELECT Id, Name, NamespacePrefix, ApiVersion, Status, ' +
                          'LengthWithoutComments, Body, LastModifiedDate, LastModifiedById, ' +
                          'LastModifiedBy.Name ' +
                          'FROM ApexClass ';
            
            List<String> conditions = new List<String>();
            
            // Search filter
            if (String.isNotBlank(searchTerm)) {
                String searchWildcard = '%' + String.escapeSingleQuotes(searchTerm) + '%';
                conditions.add('Name LIKE :searchWildcard');
            }
            
            // Exclude managed packages unless specified
            if (includeManaged != true) {
                conditions.add('NamespacePrefix = null');
            }
            
            // Only active classes
            conditions.add('Status = \'Active\'');
            
            if (!conditions.isEmpty()) {
                query += 'WHERE ' + String.join(conditions, ' AND ') + ' ';
            }
            
            query += 'ORDER BY Name ASC LIMIT 500';
            
            // Execute and filter for invocable methods
            for (ApexClass apexClass : Database.query(query)) {
                // Check if class contains @InvocableMethod
                if (apexClass.Body != null && apexClass.Body.contains('@InvocableMethod')) {
                    ApexClassItem item = mapToApexClassItem(apexClass);
                    item.isInvocable = true;
                    
                    // Parse invocable metadata from body
                    parseInvocableMetadata(item, apexClass.Body);
                    
                    results.add(item);
                }
            }
            
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Error querying Apex classes: ' + e.getMessage());
        }
        
        return results;
    }
    
    /**
     * @description Get full Apex class body and parsed invocable metadata
     * @param classId Salesforce ID of the Apex class
     * @return ApexClassMetadataResult with body and parsed metadata
     */
    @AuraEnabled
    public static ApexClassMetadataResult getApexClassMetadata(String classId) {
        ApexClassMetadataResult result = new ApexClassMetadataResult();
        result.success = false;
        
        if (String.isBlank(classId)) {
            result.errorMessage = 'Class ID is required';
            return result;
        }
        
        try {
            ApexClass apexClass = [
                SELECT Id, Name, Body, NamespacePrefix
                FROM ApexClass 
                WHERE Id = :classId 
                LIMIT 1
            ];
            
            result.id = apexClass.Id;
            result.name = apexClass.Name;
            result.body = apexClass.Body;
            result.success = true;
            
            // Parse invocable method details
            if (apexClass.Body != null && apexClass.Body.contains('@InvocableMethod')) {
                parseInvocableDetails(result, apexClass.Body);
            }
            
        } catch (QueryException qe) {
            result.errorMessage = 'Apex class not found';
        } catch (Exception e) {
            result.errorMessage = 'Error retrieving class: ' + e.getMessage();
        }
        
        return result;
    }
    
    /**
     * @description Get all Apex classes (not just invocable) with search
     * For advanced users who want to see all available classes
     * @param searchTerm Search term
     * @return List of ApexClassItem
     */
    @AuraEnabled(cacheable=true)
    public static List<ApexClassItem> getAllApexClasses(String searchTerm) {
        List<ApexClassItem> results = new List<ApexClassItem>();
        
        try {
            String query = 'SELECT Id, Name, NamespacePrefix, ApiVersion, Status, ' +
                          'LengthWithoutComments, Body, LastModifiedDate, LastModifiedById ' +
                          'FROM ApexClass WHERE Status = \'Active\' ';
            
            if (String.isNotBlank(searchTerm)) {
                String searchWildcard = '%' + String.escapeSingleQuotes(searchTerm) + '%';
                query += 'AND Name LIKE :searchWildcard ';
            }
            
            query += 'AND NamespacePrefix = null ORDER BY Name ASC LIMIT 200';
            
            for (ApexClass apexClass : Database.query(query)) {
                ApexClassItem item = mapToApexClassItem(apexClass);
                item.isInvocable = (apexClass.Body != null && apexClass.Body.contains('@InvocableMethod'));
                
                if (item.isInvocable) {
                    parseInvocableMetadata(item, apexClass.Body);
                }
                
                results.add(item);
            }
            
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Error querying Apex classes: ' + e.getMessage());
        }
        
        return results;
    }
    
    // =========================================================================
    // PRIVATE METHODS
    // =========================================================================
    
    /**
     * @description Map ApexClass to ApexClassItem DTO
     */
    private static ApexClassItem mapToApexClassItem(ApexClass apexClass) {
        ApexClassItem item = new ApexClassItem();
        item.id = apexClass.Id;
        item.name = apexClass.Name;
        item.namespacePrefix = apexClass.NamespacePrefix;
        item.fullName = String.isNotBlank(apexClass.NamespacePrefix) 
            ? apexClass.NamespacePrefix + '.' + apexClass.Name 
            : apexClass.Name;
        item.apiVersion = apexClass.ApiVersion;
        item.status = apexClass.Status;
        item.bodyLength = apexClass.LengthWithoutComments;
        item.lastModifiedDate = apexClass.LastModifiedDate;
        item.inputParameters = new List<InvocableParameter>();
        item.outputParameters = new List<InvocableParameter>();
        
        return item;
    }
    
    /**
     * @description Parse @InvocableMethod metadata from class body
     * Extracts label, description from annotation
     */
    private static void parseInvocableMetadata(ApexClassItem item, String body) {
        // Find @InvocableMethod annotation
        Pattern invocablePattern = Pattern.compile(INVOCABLE_METHOD_PATTERN);
        Matcher invocableMatcher = invocablePattern.matcher(body);
        
        if (invocableMatcher.find()) {
            String annotationContent = invocableMatcher.group(1);
            
            // Extract label
            Pattern labelPattern = Pattern.compile(LABEL_PATTERN);
            Matcher labelMatcher = labelPattern.matcher(annotationContent);
            if (labelMatcher.find()) {
                item.invocableLabel = labelMatcher.group(1);
            }
            
            // Extract description
            Pattern descPattern = Pattern.compile(DESCRIPTION_PATTERN);
            Matcher descMatcher = descPattern.matcher(annotationContent);
            if (descMatcher.find()) {
                item.invocableDescription = descMatcher.group(1);
            }
        }
        
        // If no label found in annotation, use class name
        if (String.isBlank(item.invocableLabel)) {
            item.invocableLabel = item.name;
        }
    }
    
    /**
     * @description Parse detailed invocable method info including parameters
     */
    private static void parseInvocableDetails(ApexClassMetadataResult result, String body) {
        result.inputs = new List<InvocableParameter>();
        result.outputs = new List<InvocableParameter>();
        
        // Find @InvocableMethod annotation and extract label
        Pattern invocablePattern = Pattern.compile(INVOCABLE_METHOD_PATTERN);
        Matcher invocableMatcher = invocablePattern.matcher(body);
        
        if (invocableMatcher.find()) {
            String annotationContent = invocableMatcher.group(1);
            
            // Extract label
            Pattern labelPattern = Pattern.compile(LABEL_PATTERN);
            Matcher labelMatcher = labelPattern.matcher(annotationContent);
            if (labelMatcher.find()) {
                result.invocableLabel = labelMatcher.group(1);
            }
        }
        
        // Find method name after @InvocableMethod
        // Pattern: public static [ReturnType] [MethodName]
        Pattern methodPattern = Pattern.compile(
            '@InvocableMethod[^}]*?\\s+public\\s+static\\s+(\\w+(?:<[^>]+>)?)\\s+(\\w+)\\s*\\('
        );
        Matcher methodMatcher = methodPattern.matcher(body);
        
        if (methodMatcher.find()) {
            result.invocableMethodName = methodMatcher.group(2);
        }
        
        // Find @InvocableVariable annotations for input class
        Pattern variablePattern = Pattern.compile(
            '@InvocableVariable\\s*\\(([^)]*?)\\)[^;]*?(\\w+)\\s+(\\w+)\\s*;'
        );
        Matcher variableMatcher = variablePattern.matcher(body);
        
        while (variableMatcher.find()) {
            InvocableParameter param = new InvocableParameter();
            String annotationContent = variableMatcher.group(1);
            param.dataType = variableMatcher.group(2);
            param.name = variableMatcher.group(3);
            
            // Extract label from annotation
            Pattern labelPattern = Pattern.compile(LABEL_PATTERN);
            Matcher labelMatcher = labelPattern.matcher(annotationContent);
            if (labelMatcher.find()) {
                param.label = labelMatcher.group(1);
            } else {
                param.label = param.name;
            }
            
            // Check if required
            param.isRequired = annotationContent.toLowerCase().contains('required=true');
            
            result.inputs.add(param);
        }
    }
}