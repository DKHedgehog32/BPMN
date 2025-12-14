/**
 * @description Properties panel for editing selected BPMN element or connection
 * @author Dennis van Musschenbroek (DvM) - Cobra CRM B.V.
 * @date 2024-12-12
 * @version 1.0.0
 * 
 * EXPLANATION:
 * This component displays and allows editing of properties for the currently
 * selected element or connection in the canvas. Properties vary by element type:
 * 
 * - All elements: Name, Description
 * - Tasks: Assigned Role, Duration, SLA
 * - Gateways: Default flow selection
 * - Connections: Label, Condition, Is Default
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
 * 
 * USAGE:
 * <c-process-properties
 *     selected-element={selectedElement}
 *     selected-connection={selectedConnection}
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
    
    @api readOnly = false;
    
    // =========================================================================
    // TRACKED STATE
    // =========================================================================
    
    @track _selectedElement = null;
    @track _selectedConnection = null;
    
    // Element type options for display
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
    
    // Connection type options
    connectionTypeOptions = [
        { label: 'Sequence Flow', value: 'SequenceFlow' },
        { label: 'Conditional Flow', value: 'ConditionalFlow' },
        { label: 'Default Flow', value: 'DefaultFlow' },
        { label: 'Message Flow', value: 'MessageFlow' },
        { label: 'Association', value: 'Association' },
        { label: 'Data Association', value: 'DataAssociation' }
    ];
    
    // =========================================================================
    // GETTERS - Display Logic
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
        return 'No Selection';
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
    
    // Show task-specific fields (role, duration, SLA)
    get showTaskFields() {
        if (!this._selectedElement) return false;
        const taskTypes = ['UserTask', 'ServiceTask', 'ScriptTask', 'ManualTask', 
                          'BusinessRuleTask', 'SendTask', 'ReceiveTask'];
        return taskTypes.includes(this._selectedElement.type);
    }
    
    // Show gateway-specific fields
    get showGatewayFields() {
        if (!this._selectedElement) return false;
        return this._selectedElement.type.includes('Gateway');
    }
    
    // Show connection condition field (only for conditional flows from gateways)
    get showConditionField() {
        if (!this._selectedConnection) return false;
        return this._selectedConnection.type === 'ConditionalFlow' || 
               this._selectedConnection.type === 'SequenceFlow';
    }
    
    // =========================================================================
    // GETTERS - Element Values
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
    
    get elementWidth() {
        return this._selectedElement?.width || '';
    }
    
    get elementHeight() {
        return this._selectedElement?.height || '';
    }
    
    // =========================================================================
    // GETTERS - Connection Values
    // =========================================================================
    
    get connectionLabel() {
        return this._selectedConnection?.label || '';
    }
    
    get connectionType() {
        return this._selectedConnection?.type || 'SequenceFlow';
    }
    
    get connectionCondition() {
        return this._selectedConnection?.condition || '';
    }
    
    get connectionIsDefault() {
        return this._selectedConnection?.isDefault || false;
    }
    
    // =========================================================================
    // EVENT HANDLERS - Element Properties
    // =========================================================================
    
    handleNameChange(event) {
        this.updateElementProperty('name', event.target.value);
    }
    
    handleDescriptionChange(event) {
        this.updateElementProperty('description', event.target.value);
    }
    
    handleAssignedRoleChange(event) {
        this.updateElementProperty('assignedRole', event.target.value);
    }
    
    handleDurationChange(event) {
        const value = event.target.value ? parseFloat(event.target.value) : null;
        this.updateElementProperty('durationHours', value);
    }
    
    handleSlaChange(event) {
        const value = event.target.value ? parseFloat(event.target.value) : null;
        this.updateElementProperty('slaHours', value);
    }
    
    handlePositionXChange(event) {
        const value = event.target.value ? parseFloat(event.target.value) : 0;
        this.updateElementProperty('x', value);
    }
    
    handlePositionYChange(event) {
        const value = event.target.value ? parseFloat(event.target.value) : 0;
        this.updateElementProperty('y', value);
    }
    
    handleWidthChange(event) {
        const value = event.target.value ? parseFloat(event.target.value) : 100;
        this.updateElementProperty('width', value);
    }
    
    handleHeightChange(event) {
        const value = event.target.value ? parseFloat(event.target.value) : 80;
        this.updateElementProperty('height', value);
    }
    
    // =========================================================================
    // EVENT HANDLERS - Connection Properties
    // =========================================================================
    
    handleConnectionLabelChange(event) {
        this.updateConnectionProperty('label', event.target.value);
    }
    
    handleConnectionTypeChange(event) {
        this.updateConnectionProperty('type', event.detail.value);
    }
    
    handleConditionChange(event) {
        this.updateConnectionProperty('condition', event.target.value);
    }
    
    handleIsDefaultChange(event) {
        this.updateConnectionProperty('isDefault', event.target.checked);
    }
    
    // =========================================================================
    // PROPERTY UPDATE HELPERS
    // =========================================================================
    
    updateElementProperty(propertyName, value) {
        if (!this._selectedElement || this.readOnly) return;
        
        // Update local state
        this._selectedElement = {
            ...this._selectedElement,
            [propertyName]: value
        };
        
        // Dispatch event to canvas
        this.dispatchEvent(new CustomEvent('propertychange', {
            detail: {
                type: 'element',
                elementId: this._selectedElement.id,
                property: propertyName,
                value: value,
                element: { ...this._selectedElement }
            }
        }));
    }
    
    updateConnectionProperty(propertyName, value) {
        if (!this._selectedConnection || this.readOnly) return;
        
        // Update local state
        this._selectedConnection = {
            ...this._selectedConnection,
            [propertyName]: value
        };
        
        // Dispatch event to canvas
        this.dispatchEvent(new CustomEvent('propertychange', {
            detail: {
                type: 'connection',
                connectionId: this._selectedConnection.id,
                property: propertyName,
                value: value,
                connection: { ...this._selectedConnection }
            }
        }));
    }
    
    // =========================================================================
    // ACTIONS
    // =========================================================================
    
    handleDelete() {
        if (this.readOnly) return;
        
        if (this._selectedElement) {
            this.dispatchEvent(new CustomEvent('deleteelement', {
                detail: { elementId: this._selectedElement.id }
            }));
        } else if (this._selectedConnection) {
            this.dispatchEvent(new CustomEvent('deleteconnection', {
                detail: { connectionId: this._selectedConnection.id }
            }));
        }
    }
    
    handleDuplicate() {
        if (this.readOnly || !this._selectedElement) return;
        
        this.dispatchEvent(new CustomEvent('duplicateelement', {
            detail: { elementId: this._selectedElement.id }
        }));
    }
}
