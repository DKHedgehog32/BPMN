/**
 * @description Properties panel for editing selected BPMN element or connection
 * @author Dennis van Musschenbroek (DvM) - Cobra CRM B.V.
 * @date 2024-12-14
 * @version 1.1.1
 * 
 * EXPLANATION:
 * This component displays and allows editing of properties for the currently
 * selected element or connection in the canvas. Properties vary by element type:
 * 
 * - All elements: Name, Description
 * - Tasks: Assigned Role, Duration, SLA
 * - Gateways: Default flow selection, Complexity Info
 * - Connections: Label, Condition, Is Default
 * 
 * NEW: Process Quality Score display with:
 * - Overall score (0-100) with letter grade (A-F)
 * - CFC breakdown by gateway type
 * - Dimension scores as progress bars
 * - Issues and recommendations
 * 
 * Changes are communicated back to the canvas via custom events.
 * 
 * DEPENDENCIES:
 * - processCanvas: Receives selection events, sends property updates
 * 
 * CHANGELOG:
 * Version | Date       | Author | Description
 * --------|------------|--------|------------------------------------------
 * 1.0.0   | 2024-12-12 | DvM    | Initial creation - properties panel
 * 1.1.0   | 2024-12-14 | DvM    | Added Process Quality Score section
 * 1.1.1   | 2024-12-14 | DvM    | Fixed LWC issues:
 *                                 - Use CSS classes for progress bar widths
 *                                 - Added positionDisabled getter
 * 
 * USAGE:
 * <c-process-properties
 *     selected-element={selectedElement}
 *     selected-connection={selectedConnection}
 *     score-data={scoreData}
 *     read-only={isReadOnly}
 *     onpropertychange={handlePropertyChange}>
 * </c-process-properties>
 */
import { LightningElement, api, track } from 'lwc';

export default class ProcessProperties extends LightningElement {
    
    // =========================================================================
    // PUBLIC API
    // =========================================================================
    
    @api 
    get selectedElement() {
        return this._selectedElement;
    }
    set selectedElement(value) {
        this._selectedElement = value ? { ...value } : null;
        this._selectedConnection = null;
    }
    
    @api 
    get selectedConnection() {
        return this._selectedConnection;
    }
    set selectedConnection(value) {
        this._selectedConnection = value ? { ...value } : null;
        this._selectedElement = null;
    }
    
    @api 
    get scoreData() {
        return this._scoreData;
    }
    set scoreData(value) {
        this._scoreData = value ? { ...value } : null;
    }
    
    @api readOnly = false;
    
    @api 
    get importedFlowInfo() {
        return this._importedFlowInfo;
    }
    set importedFlowInfo(value) {
        this._importedFlowInfo = value ? { ...value } : null;
    }
    
    // =========================================================================
    // TRACKED STATE
    // =========================================================================
    
    @track _selectedElement = null;
    @track _selectedConnection = null;
    @track _scoreData = null;
    @track _importedFlowInfo = null;
    @track showScoreDetails = false;
    
    // Element type display labels
    elementTypeLabels = {
        // Events
        StartEvent: 'Start Event',
        EndEvent: 'End Event',
        IntermediateEvent: 'Intermediate Event',
        TimerStartEvent: 'Timer Start Event',
        MessageStartEvent: 'Message Start Event',
        MessageIntermediateCatchEvent: 'Message Catch Event',
        MessageEndEvent: 'Message End Event',
        TimerIntermediateEvent: 'Timer Event',
        SignalStartEvent: 'Signal Start Event',
        SignalIntermediateEvent: 'Signal Event',
        SignalEndEvent: 'Signal End Event',
        ErrorEndEvent: 'Error End Event',
        ErrorBoundaryEvent: 'Error Boundary Event',
        TerminateEndEvent: 'Terminate Event',
        WaitEvent: 'Wait/Pause',
        
        // Tasks
        UserTask: 'User Task',
        ServiceTask: 'Service Task',
        ScriptTask: 'Script Task',
        ManualTask: 'Manual Task',
        BusinessRuleTask: 'Business Rule Task',
        SendTask: 'Send Task',
        ReceiveTask: 'Receive Task',
        
        // Salesforce Task Types
        RecordCreateTask: 'Create Records',
        RecordUpdateTask: 'Update Records',
        RecordDeleteTask: 'Delete Records',
        RecordLookupTask: 'Get Records',
        AssignmentTask: 'Assignment',
        ActionCallTask: 'Action',
        ScreenTask: 'Screen',
        LoopTask: 'Loop',
        
        // Gateways
        ExclusiveGateway: 'Exclusive Gateway (XOR)',
        ParallelGateway: 'Parallel Gateway (AND)',
        InclusiveGateway: 'Inclusive Gateway (OR)',
        EventBasedGateway: 'Event-Based Gateway',
        ComplexGateway: 'Complex Gateway',
        
        // Containers
        SubProcess: 'Sub-Process',
        CallActivity: 'Call Activity',
        Pool: 'Pool',
        Lane: 'Lane',
        
        // Data & Artifacts
        DataObject: 'Data Object',
        DataStore: 'Data Store',
        TextAnnotation: 'Text Annotation',
        Group: 'Group'
    };
    
    // =========================================================================
    // GETTERS - SELECTION STATE
    // =========================================================================
    
    get hasImportedFlow() {
        return !!this._importedFlowInfo?.name;
    }
    
    get importedFlowName() {
        return this._importedFlowInfo?.label || this._importedFlowInfo?.name || '';
    }
    
    get importedFlowApiName() {
        return this._importedFlowInfo?.name || '';
    }
    
    get importedFlowType() {
        const typeMap = {
            'Flow': 'Screen Flow',
            'AutoLaunchedFlow': 'Autolaunched Flow',
            'Workflow': 'Record-Triggered Flow',
            'CustomEvent': 'Platform Event Flow',
            'InvocableProcess': 'Invocable Process',
            'Survey': 'Survey',
            'ActionCadenceFlow': 'Action Cadence',
            'Orchestration': 'Orchestration',
            'TransactionSecurityFlow': 'Transaction Security'
        };
        const processType = this._importedFlowInfo?.processType || '';
        return typeMap[processType] || processType || '';
    }
    
    get hasSelection() {
        return this._selectedElement || this._selectedConnection;
    }
    
    get isElementSelected() {
        return !!this._selectedElement;
    }
    
    get isConnectionSelected() {
        return !!this._selectedConnection;
    }
    
    get selectionTitle() {
        if (this._selectedElement) {
            return this.elementTypeLabels[this._selectedElement.type] || this._selectedElement.type;
        }
        if (this._selectedConnection) {
            return 'Connection';
        }
        return 'Properties';
    }
    
    get selectionIcon() {
        if (this._selectedElement) {
            const type = this._selectedElement.type;
            if (type.includes('Event')) return 'utility:record';
            if (type.includes('Task')) return 'utility:task';
            if (type.includes('Gateway')) return 'utility:routing_offline';
            if (type.includes('SubProcess') || type.includes('CallActivity')) return 'utility:layers';
            if (type.includes('Data')) return 'utility:database';
            return 'utility:edit_form';
        }
        if (this._selectedConnection) {
            return 'utility:arrow';
        }
        return 'utility:info';
    }
    
    // Position fields are always disabled (display only)
    get positionDisabled() {
        return true;
    }
    
    // =========================================================================
    // GETTERS - ELEMENT FIELD VISIBILITY
    // =========================================================================
    
    get showTaskFields() {
        if (!this._selectedElement) return false;
        const taskTypes = ['UserTask', 'ServiceTask', 'ScriptTask', 'ManualTask', 
                          'BusinessRuleTask', 'SendTask', 'ReceiveTask'];
        return taskTypes.includes(this._selectedElement.type);
    }
    
    get showGatewayFields() {
        if (!this._selectedElement) return false;
        return this._selectedElement.type.includes('Gateway');
    }
    
    get showContainerFields() {
        if (!this._selectedElement) return false;
        return this._selectedElement.type === 'Pool' || this._selectedElement.type === 'Lane';
    }
    
    get isHorizontalOrientation() {
        if (!this._selectedElement) return true;
        return this._selectedElement.orientation !== 'vertical';
    }
    
    get elementWidth() {
        return this._selectedElement?.width ? Math.round(this._selectedElement.width) : '';
    }
    
    get elementHeight() {
        return this._selectedElement?.height ? Math.round(this._selectedElement.height) : '';
    }
    
    get orientationOptions() {
        return [
            { label: 'Horizontal', value: 'horizontal' },
            { label: 'Vertical', value: 'vertical' }
        ];
    }
    
    get selectedOrientation() {
        return this._selectedElement?.orientation || 'horizontal';
    }
    
    get showConditionField() {
        if (!this._selectedConnection) return false;
        return this._selectedConnection.type === 'ConditionalFlow' || 
               this._selectedConnection.type === 'SequenceFlow';
    }
    
    // =========================================================================
    // GETTERS - ELEMENT VALUES
    // =========================================================================
    
    get elementName() {
        return this._selectedElement?.name || '';
    }
    
    get elementDescription() {
        return this._selectedElement?.description || '';
    }
    
    get elementAssignedRole() {
        return this._selectedElement?.assignedRole || '';
    }
    
    get elementDurationHours() {
        return this._selectedElement?.durationHours || '';
    }
    
    get elementSlaHours() {
        return this._selectedElement?.slaHours || '';
    }
    
    get elementPositionX() {
        return this._selectedElement?.x ? Math.round(this._selectedElement.x) : '';
    }
    
    get elementPositionY() {
        return this._selectedElement?.y ? Math.round(this._selectedElement.y) : '';
    }
    
    // =========================================================================
    // GETTERS - SALESFORCE METADATA
    // =========================================================================
    
    get showSalesforceSection() {
        if (!this._selectedElement) return false;
        // Show for tasks, events (except basic start/end), and gateways
        const type = this._selectedElement.type;
        return type.includes('Task') || 
               type.includes('Gateway') ||
               (type.includes('Event') && !['StartEvent', 'EndEvent'].includes(type)) ||
               type === 'CallActivity' ||
               type === 'SubProcess' ||
               type.includes('Record') ||
               type.includes('Screen') ||
               type.includes('Action') ||
               type.includes('Assignment') ||
               type.includes('Loop') ||
               type.includes('Wait');
    }
    
    get isImportedFromSalesforce() {
        return this._selectedElement?.salesforceMetadata?.isImported || false;
    }
    
    get salesforceApiName() {
        return this._selectedElement?.salesforceMetadata?.apiName || '';
    }
    
    get salesforceFlowElementType() {
        return this._selectedElement?.salesforceMetadata?.flowElementType || '';
    }
    
    get salesforceFlowElementTypeLabel() {
        const type = this._selectedElement?.salesforceMetadata?.flowElementType || '';
        const labels = {
            'FlowScreen': 'Screen',
            'FlowDecision': 'Decision',
            'FlowRecordCreate': 'Create Records',
            'FlowRecordUpdate': 'Update Records',
            'FlowRecordDelete': 'Delete Records',
            'FlowRecordLookup': 'Get Records',
            'FlowAssignment': 'Assignment',
            'FlowActionCall': 'Action',
            'FlowSubflow': 'Subflow',
            'FlowLoop': 'Loop',
            'FlowWait': 'Pause',
            'FlowStart': 'Start',
            'FlowEnd': 'End'
        };
        return labels[type] || type;
    }
    
    get salesforceActionType() {
        return this._selectedElement?.salesforceMetadata?.actionType || '';
    }
    
    get salesforceTriggerType() {
        return this._selectedElement?.salesforceMetadata?.triggerType || '';
    }
    
    get salesforceTriggerTypeLabel() {
        const type = this._selectedElement?.salesforceMetadata?.triggerType || '';
        const labels = {
            'RecordBeforeSave': 'Record - Before Save',
            'RecordAfterSave': 'Record - After Save',
            'Scheduled': 'Scheduled',
            'PlatformEvent': 'Platform Event'
        };
        return labels[type] || type || 'None';
    }
    
    get salesforceObjectApiName() {
        return this._selectedElement?.salesforceMetadata?.objectApiName || 
               this._selectedElement?.salesforceMetadata?.triggerObject || '';
    }
    
    get salesforceApexClassName() {
        return this._selectedElement?.salesforceMetadata?.apexClassName || '';
    }
    
    get salesforceLwcComponentName() {
        return this._selectedElement?.salesforceMetadata?.lwcComponentName || '';
    }
    
    get hasSalesforceObject() {
        return !!this.salesforceObjectApiName;
    }
    
    get hasSalesforceApex() {
        return !!this.salesforceApexClassName;
    }
    
    get hasSalesforceLwc() {
        return !!this.salesforceLwcComponentName;
    }
    
    get salesforceProcessType() {
        return this._selectedElement?.salesforceMetadata?.processType || '';
    }
    
    get salesforceProcessTypeLabel() {
        const type = this._selectedElement?.salesforceMetadata?.processType || '';
        const labels = {
            'Flow': 'Screen Flow',
            'AutoLaunchedFlow': 'Auto-Launched Flow',
            'Workflow': 'Workflow Rule',
            'CustomEvent': 'Platform Event Flow',
            'InvocableProcess': 'Invocable Process'
        };
        return labels[type] || type || '';
    }
    
    // Action Type options for combobox
    get actionTypeOptions() {
        return [
            { label: '-- Core Actions --', value: '', disabled: true },
            { label: 'Apex Action', value: 'apex' },
            { label: 'Flow', value: 'flow' },
            { label: 'Quick Action', value: 'quickAction' },
            { label: 'Email Alert', value: 'emailAlert' },
            { label: 'Send Email', value: 'emailSimple' },
            { label: 'Submit for Approval', value: 'submit' },
            
            { label: '-- Record Operations --', value: '', disabled: true },
            { label: 'Create Records', value: 'createRecord' },
            { label: 'Update Records', value: 'updateRecord' },
            { label: 'Delete Records', value: 'deleteRecord' },
            { label: 'Get Records', value: 'getRecord' },
            
            { label: '-- Communication --', value: '', disabled: true },
            { label: 'Chatter Post', value: 'chatterPost' },
            { label: 'Custom Notification', value: 'customNotificationAction' },
            { label: 'Send Survey', value: 'sendSurveyInvitation' },
            
            { label: '-- Slack --', value: '', disabled: true },
            { label: 'Post to Slack', value: 'slackPostMessage' },
            { label: 'Create Slack Channel', value: 'slackCreateChannel' },
            
            { label: '-- Einstein --', value: '', disabled: true },
            { label: 'Generate Prompt Response', value: 'generatePromptResponse' },
            { label: 'Einstein Recommendation', value: 'einsteinRecommendation' }
        ];
    }
    
    // Trigger Type options for combobox
    get triggerTypeOptions() {
        return [
            { label: 'None', value: '' },
            { label: 'Record - Before Save', value: 'RecordBeforeSave' },
            { label: 'Record - After Save', value: 'RecordAfterSave' },
            { label: 'Scheduled', value: 'Scheduled' },
            { label: 'Platform Event', value: 'PlatformEvent' },
            { label: 'Segment', value: 'Segment' },
            { label: 'Data Cloud Change', value: 'DataCloudDataChange' }
        ];
    }
    
    // =========================================================================
    // GETTERS - CONNECTION VALUES
    // =========================================================================
    
    get connectionLabel() {
        return this._selectedConnection?.label || '';
    }
    
    get connectionCondition() {
        return this._selectedConnection?.condition || '';
    }
    
    get connectionIsDefault() {
        return this._selectedConnection?.isDefault || false;
    }
    
    // =========================================================================
    // GETTERS - SCORE DATA
    // =========================================================================
    
    get hasScoreData() {
        return !!this._scoreData;
    }
    
    get scoreTotal() {
        return this._scoreData?.total || 0;
    }
    
    get scoreGrade() {
        return this._scoreData?.grade || '-';
    }
    
    get scoreGradeColor() {
        return this._scoreData?.gradeColor || '#718096';
    }
    
    get scoreGradeClass() {
        const grade = this._scoreData?.grade || 'F';
        return `grade-badge grade-${grade.toLowerCase()}`;
    }
    
    get scoreCFC() {
        return this._scoreData?.cfc || 0;
    }
    
    get scoreCfcXOR() {
        return this._scoreData?.cfcBreakdown?.xor || 0;
    }
    
    get scoreCfcOR() {
        return this._scoreData?.cfcBreakdown?.or || 0;
    }
    
    get scoreCfcAND() {
        return this._scoreData?.cfcBreakdown?.and || 0;
    }
    
    get scoreNOAJS() {
        return this._scoreData?.noajs || 0;
    }
    
    get scoreNOA() {
        return this._scoreData?.noa || 0;
    }
    
    get scoreGatewayCount() {
        return this._scoreData?.gatewayCount || 0;
    }
    
    // Threshold indicators
    get cfcThreshold() {
        return this._scoreData?.thresholds?.cfc || 'low';
    }
    
    get noajsThreshold() {
        return this._scoreData?.thresholds?.noajs || 'low';
    }
    
    get cfcThresholdClass() {
        return `threshold-badge threshold-${this.cfcThreshold}`;
    }
    
    get noajsThresholdClass() {
        return `threshold-badge threshold-${this.noajsThreshold}`;
    }
    
    // Dimension scores - NEW ACADEMIC GRADE DIMENSIONS
    get dimensionStructural() {
        return this._scoreData?.dimensions?.structural || 0;
    }
    
    get dimensionControlFlow() {
        return this._scoreData?.dimensions?.controlFlow || 0;
    }
    
    get dimensionStructuredness() {
        return this._scoreData?.dimensions?.structuredness || 0;
    }
    
    get dimensionNaming() {
        return this._scoreData?.dimensions?.naming || 0;
    }
    
    get dimensionModularity() {
        return this._scoreData?.dimensions?.modularity || 0;
    }
    
    get dimensionStartEnd() {
        return this._scoreData?.dimensions?.startEnd || 0;
    }
    
    get dimensionHandover() {
        return this._scoreData?.dimensions?.handover || 0;
    }
    
    // Check if handover is estimated (no real lane data)
    get isHandoverEstimated() {
        return this._scoreData?.handoverComplexity?.isEstimated || false;
    }
    
    get handoverEstimatedLabel() {
        return this.isHandoverEstimated ? '*' : '';
    }
    
    get handoverTooltip() {
        if (this.isHandoverEstimated) {
            return 'Handover (estimated from element types - no lane data available)';
        }
        return 'Role transitions - Signavio';
    }
    
    // Weighted CFC (includes nesting depth)
    get scoreWeightedCFC() {
        return this._scoreData?.weightedCfc || 0;
    }
    
    // Structuredness score
    get structurednessScore() {
        return this._scoreData?.structuredness?.score || 100;
    }
    
    get structurednessSplits() {
        return this._scoreData?.structuredness?.totalSplits || 0;
    }
    
    get structurednessJoins() {
        return this._scoreData?.structuredness?.totalJoins || 0;
    }
    
    get structurednessMatched() {
        return this._scoreData?.structuredness?.matchedPairs || 0;
    }
    
    // Naming quality details
    get namingOverallScore() {
        return this._scoreData?.namingQuality?.overallScore || 100;
    }
    
    get namingGoodLabels() {
        return this._scoreData?.namingQuality?.goodLabels || 0;
    }
    
    get namingPoorLabels() {
        return this._scoreData?.namingQuality?.poorLabels || 0;
    }
    
    // Handover complexity
    get handoverScore() {
        return this._scoreData?.handoverComplexity?.normalizedScore || 0;
    }
    
    get handoverTransitions() {
        return this._scoreData?.handoverComplexity?.transitions?.length || 0;
    }
    
    get handoverHasRoleData() {
        return this._scoreData?.handoverComplexity?.hasRoleData || false;
    }
    
    // Start/End event counts
    get startEventCount() {
        return this._scoreData?.startEventCount || 0;
    }
    
    get endEventCount() {
        return this._scoreData?.endEventCount || 0;
    }
    
    // =========================================================================
    // GETTERS - DIMENSION BAR CLASSES (using CSS width classes)
    // LWC doesn't allow inline style bindings, so we use predefined CSS classes
    // =========================================================================
    
    /**
     * @description Get CSS class for progress bar width
     * Uses predefined CSS classes: bar-w-0, bar-w-10, bar-w-20, ... bar-w-100
     */
    getBarWidthClass(value) {
        // Round to nearest 5%
        const rounded = Math.round(value / 5) * 5;
        const clamped = Math.max(0, Math.min(100, rounded));
        return `dimension-bar bar-w-${clamped}`;
    }
    
    get structuralBarClass() {
        return this.getBarWidthClass(this.dimensionStructural);
    }
    
    get controlFlowBarClass() {
        return this.getBarWidthClass(this.dimensionControlFlow);
    }
    
    get structurednessBarClass() {
        return this.getBarWidthClass(this.dimensionStructuredness);
    }
    
    get namingBarClass() {
        return this.getBarWidthClass(this.dimensionNaming);
    }
    
    get modularityBarClass() {
        return this.getBarWidthClass(this.dimensionModularity);
    }
    
    get startEndBarClass() {
        return this.getBarWidthClass(this.dimensionStartEnd);
    }
    
    get handoverBarClass() {
        return this.getBarWidthClass(this.dimensionHandover);
    }
    
    // Academic compliance indicators
    get complianceCardosoCFC() {
        return this._scoreData?.compliance?.cardosoCFC || false;
    }
    
    get complianceMendling7PMG() {
        return this._scoreData?.compliance?.mendling7PMG || false;
    }
    
    get complianceSignavioNesting() {
        return this._scoreData?.compliance?.signavioNesting || false;
    }
    
    get complianceSignavioHandover() {
        return this._scoreData?.compliance?.signavioHandover || false;
    }
    
    // Issues
    get hasIssues() {
        return this._scoreData?.issues?.length > 0;
    }
    
    get scoreIssues() {
        if (!this._scoreData?.issues) return [];
        return this._scoreData.issues.map((issue, index) => ({
            ...issue,
            key: `issue-${index}`,
            iconName: issue.type === 'error' ? 'utility:error' : 'utility:warning',
            iconVariant: issue.type === 'error' ? 'error' : 'warning',
            severityClass: `issue-item issue-${issue.severity}`
        }));
    }
    
    // =========================================================================
    // GETTERS - GATEWAY COMPLEXITY INFO (when gateway is selected)
    // =========================================================================
    
    get showGatewayComplexity() {
        if (!this._selectedElement) return false;
        return this._selectedElement.type.includes('Gateway');
    }
    
    get selectedGatewayType() {
        if (!this._selectedElement) return '';
        const typeMap = {
            'ExclusiveGateway': 'XOR (Exclusive)',
            'ParallelGateway': 'AND (Parallel)',
            'InclusiveGateway': 'OR (Inclusive)',
            'EventBasedGateway': 'Event-Based'
        };
        return typeMap[this._selectedElement.type] || 'Gateway';
    }
    
    get selectedGatewayCFC() {
        if (!this._selectedElement?.cfcContribution) return 0;
        return this._selectedElement.cfcContribution;
    }
    
    get selectedGatewayDescription() {
        if (!this._selectedElement?.complexityDescription) return '';
        return this._selectedElement.complexityDescription;
    }
    
    get isSelectedGatewayHighRisk() {
        return this._selectedElement?.isHighRisk || false;
    }
    
    // =========================================================================
    // EVENT HANDLERS - ELEMENT PROPERTIES
    // =========================================================================
    
    handleNameChange(event) {
        this.dispatchPropertyChange('name', event.target.value);
    }
    
    handleDescriptionChange(event) {
        this.dispatchPropertyChange('description', event.target.value);
    }
    
    handleAssignedRoleChange(event) {
        this.dispatchPropertyChange('assignedRole', event.target.value);
    }
    
    handleDurationChange(event) {
        const value = event.target.value ? parseFloat(event.target.value) : null;
        this.dispatchPropertyChange('durationHours', value);
    }
    
    handleSlaChange(event) {
        const value = event.target.value ? parseFloat(event.target.value) : null;
        this.dispatchPropertyChange('slaHours', value);
    }
    
    // =========================================================================
    // EVENT HANDLERS - CONTAINER PROPERTIES (Pool/Lane)
    // =========================================================================
    
    handleOrientationChange(event) {
        this.dispatchPropertyChange('orientation', event.detail.value);
        // Also need to swap width/height
        if (this._selectedElement) {
            const newWidth = this._selectedElement.height;
            const newHeight = this._selectedElement.width;
            this.dispatchPropertyChange('width', newWidth);
            this.dispatchPropertyChange('height', newHeight);
        }
    }
    
    handleWidthChange(event) {
        const value = event.target.value ? parseInt(event.target.value, 10) : null;
        if (value && value >= 100) {
            this.dispatchPropertyChange('width', value);
        }
    }
    
    handleHeightChange(event) {
        const value = event.target.value ? parseInt(event.target.value, 10) : null;
        if (value && value >= 80) {
            this.dispatchPropertyChange('height', value);
        }
    }
    
    // =========================================================================
    // EVENT HANDLERS - CONNECTION PROPERTIES
    // =========================================================================
    
    handleConnectionLabelChange(event) {
        this.dispatchConnectionChange('label', event.target.value);
    }
    
    handleConditionChange(event) {
        this.dispatchConnectionChange('condition', event.target.value);
    }
    
    handleIsDefaultChange(event) {
        this.dispatchConnectionChange('isDefault', event.target.checked);
    }
    
    // =========================================================================
    // EVENT HANDLERS - SALESFORCE METADATA
    // =========================================================================
    
    handleSalesforceApiNameChange(event) {
        this.dispatchSalesforcePropertyChange('apiName', event.target.value);
    }
    
    handleSalesforceActionTypeChange(event) {
        this.dispatchSalesforcePropertyChange('actionType', event.detail.value);
    }
    
    handleSalesforceTriggerTypeChange(event) {
        this.dispatchSalesforcePropertyChange('triggerType', event.detail.value);
    }
    
    handleSalesforceObjectChange(event) {
        this.dispatchSalesforcePropertyChange('objectApiName', event.target.value);
    }
    
    handleSalesforceApexClassChange(event) {
        this.dispatchSalesforcePropertyChange('apexClassName', event.target.value);
    }
    
    handleSalesforceLwcChange(event) {
        this.dispatchSalesforcePropertyChange('lwcComponentName', event.target.value);
    }
    
    /**
     * Dispatch Salesforce metadata property change
     * Updates the nested salesforceMetadata object on the element
     */
    dispatchSalesforcePropertyChange(property, value) {
        if (!this._selectedElement) return;
        
        // Get current metadata or create new
        const currentMetadata = this._selectedElement.salesforceMetadata || {};
        const updatedMetadata = {
            ...currentMetadata,
            [property]: value
        };
        
        this.dispatchPropertyChange('salesforceMetadata', updatedMetadata);
    }
    
    // =========================================================================
    // EVENT HANDLERS - SCORE SECTION
    // =========================================================================
    
    toggleScoreDetails() {
        this.showScoreDetails = !this.showScoreDetails;
    }
    
    get scoreDetailsIcon() {
        return this.showScoreDetails ? 'utility:chevrondown' : 'utility:chevronright';
    }
    
    // =========================================================================
    // EVENT HANDLERS - DELETE ACTIONS
    // =========================================================================
    
    handleDelete() {
        if (this._selectedElement) {
            this.dispatchEvent(new CustomEvent('deleteelement'));
        } else if (this._selectedConnection) {
            this.dispatchEvent(new CustomEvent('deleteconnection'));
        }
    }
    
    // =========================================================================
    // HELPER METHODS
    // =========================================================================
    
    dispatchPropertyChange(property, value) {
        this.dispatchEvent(new CustomEvent('propertychange', {
            detail: {
                type: 'element',
                elementId: this._selectedElement?.id,
                property,
                value
            }
        }));
    }
    
    dispatchConnectionChange(property, value) {
        this.dispatchEvent(new CustomEvent('propertychange', {
            detail: {
                type: 'connection',
                connectionId: this._selectedConnection?.id,
                property,
                value
            }
        }));
    }
}