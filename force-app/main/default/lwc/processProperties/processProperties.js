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
    
    // =========================================================================
    // TRACKED STATE
    // =========================================================================
    
    @track _selectedElement = null;
    @track _selectedConnection = null;
    @track _scoreData = null;
    @track showScoreDetails = false;
    
    // Element type display labels
    elementTypeLabels = {
        StartEvent: 'Start Event',
        EndEvent: 'End Event',
        IntermediateEvent: 'Intermediate Event',
        TimerStartEvent: 'Timer Start Event',
        MessageStartEvent: 'Message Start Event',
        UserTask: 'User Task',
        ServiceTask: 'Service Task',
        ScriptTask: 'Script Task',
        ManualTask: 'Manual Task',
        BusinessRuleTask: 'Business Rule Task',
        SendTask: 'Send Task',
        ReceiveTask: 'Receive Task',
        ExclusiveGateway: 'Exclusive Gateway (XOR)',
        ParallelGateway: 'Parallel Gateway (AND)',
        InclusiveGateway: 'Inclusive Gateway (OR)',
        EventBasedGateway: 'Event-Based Gateway',
        SubProcess: 'Sub-Process',
        CallActivity: 'Call Activity',
        DataObject: 'Data Object',
        DataStore: 'Data Store',
        TextAnnotation: 'Text Annotation',
        Group: 'Group'
    };
    
    // =========================================================================
    // GETTERS - SELECTION STATE
    // =========================================================================
    
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
    
    // Dimension scores
    get dimensionStructural() {
        return this._scoreData?.dimensions?.structural || 0;
    }
    
    get dimensionControlFlow() {
        return this._scoreData?.dimensions?.controlFlow || 0;
    }
    
    get dimensionCorrectness() {
        return this._scoreData?.dimensions?.correctness || 0;
    }
    
    get dimensionNaming() {
        return this._scoreData?.dimensions?.naming || 0;
    }
    
    get dimensionModularity() {
        return this._scoreData?.dimensions?.modularity || 0;
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
    
    get correctnessBarClass() {
        return this.getBarWidthClass(this.dimensionCorrectness);
    }
    
    get namingBarClass() {
        return this.getBarWidthClass(this.dimensionNaming);
    }
    
    get modularityBarClass() {
        return this.getBarWidthClass(this.dimensionModularity);
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