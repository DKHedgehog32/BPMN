/**
 * @description Palette component with draggable BPMN elements
 * @author Dennis van Musschenbroek (DvM) - Cobra CRM B.V.
 * @date 2024-12-12
 * @version 1.0.1
 * 
 * EXPLANATION:
 * This component provides a categorized palette of BPMN 2.0 elements that can
 * be dragged onto the canvas. All computed values are pre-calculated in getters
 * because LWC templates don't support inline expressions.
 * 
 * CHANGELOG:
 * Version | Date       | Author | Description
 * --------|------------|--------|------------------------------------------
 * 1.0.0   | 2024-12-12 | DvM    | Initial creation - element palette
 * 1.0.1   | 2024-12-12 | DvM    | Fixed: pre-calculate all template expressions
 * 
 * USAGE:
 * <c-process-palette></c-process-palette>
 */
import { LightningElement, track } from 'lwc';

export default class ProcessPalette extends LightningElement {
    
    // Palette categories with BPMN elements
    @track categories = [
        {
            id: 'events',
            name: 'Events',
            icon: 'utility:record',
            expanded: true,
            elements: [
                { type: 'StartEvent', name: 'Start Event', description: 'Indicates where a process begins' },
                { type: 'EndEvent', name: 'End Event', description: 'Indicates where a process ends' },
                { type: 'IntermediateEvent', name: 'Intermediate Event', description: 'Event occurring between start and end' },
                { type: 'TimerStartEvent', name: 'Timer Start', description: 'Process triggered by timer/schedule' },
                { type: 'MessageStartEvent', name: 'Message Start', description: 'Process triggered by message' }
            ]
        },
        {
            id: 'tasks',
            name: 'Tasks',
            icon: 'utility:task',
            expanded: true,
            elements: [
                { type: 'UserTask', name: 'User Task', description: 'Task performed by a human' },
                { type: 'ServiceTask', name: 'Service Task', description: 'Automated service/API call' },
                { type: 'ScriptTask', name: 'Script Task', description: 'Automated script execution' },
                { type: 'ManualTask', name: 'Manual Task', description: 'Manual activity outside system' },
                { type: 'BusinessRuleTask', name: 'Business Rule', description: 'Decision/business rule evaluation' },
                { type: 'SendTask', name: 'Send Task', description: 'Send a message' },
                { type: 'ReceiveTask', name: 'Receive Task', description: 'Wait for a message' }
            ]
        },
        {
            id: 'gateways',
            name: 'Gateways',
            icon: 'utility:routing_offline',
            expanded: true,
            elements: [
                { type: 'ExclusiveGateway', name: 'Exclusive Gateway', description: 'XOR - One path taken based on condition' },
                { type: 'ParallelGateway', name: 'Parallel Gateway', description: 'AND - All paths taken simultaneously' },
                { type: 'InclusiveGateway', name: 'Inclusive Gateway', description: 'OR - One or more paths taken' },
                { type: 'EventBasedGateway', name: 'Event-Based Gateway', description: 'Path determined by event occurrence' }
            ]
        },
        {
            id: 'subprocess',
            name: 'Sub-Processes',
            icon: 'utility:layers',
            expanded: false,
            elements: [
                { type: 'SubProcess', name: 'Sub-Process', description: 'Embedded sub-process container' },
                { type: 'CallActivity', name: 'Call Activity', description: 'Reference to reusable process' }
            ]
        },
        {
            id: 'data',
            name: 'Data',
            icon: 'utility:database',
            expanded: false,
            elements: [
                { type: 'DataObject', name: 'Data Object', description: 'Data used or produced' },
                { type: 'DataStore', name: 'Data Store', description: 'Persistent data storage' }
            ]
        },
        {
            id: 'artifacts',
            name: 'Artifacts',
            icon: 'utility:note',
            expanded: false,
            elements: [
                { type: 'TextAnnotation', name: 'Text Annotation', description: 'Additional information/notes' },
                { type: 'Group', name: 'Group', description: 'Visual grouping of elements' }
            ]
        }
    ];
    
    // Search/filter term
    @track searchTerm = '';
    
    // =========================================================================
    // GETTERS - Pre-computed values for template
    // =========================================================================
    
    // Filter and enhance categories for template
    get filteredCategories() {
        let cats = this.categories;
        
        // Filter by search term if present
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            cats = cats
                .map(cat => ({
                    ...cat,
                    expanded: true,
                    elements: cat.elements.filter(el => 
                        el.name.toLowerCase().includes(term) ||
                        el.description.toLowerCase().includes(term)
                    )
                }))
                .filter(cat => cat.elements.length > 0);
        }
        
        // Add pre-computed properties for each category
        return cats.map(cat => ({
            ...cat,
            // Pre-compute chevron icon based on expanded state
            chevronIcon: cat.expanded ? 'utility:chevrondown' : 'utility:chevronright',
            // Pre-compute element count as string
            elementCount: String(cat.elements.length),
            // Add type-specific flags to each element for SVG rendering
            elements: cat.elements.map(el => ({
                ...el,
                isStartEvent: el.type === 'StartEvent',
                isEndEvent: el.type === 'EndEvent',
                isIntermediateEvent: el.type === 'IntermediateEvent',
                isTimerStartEvent: el.type === 'TimerStartEvent',
                isMessageStartEvent: el.type === 'MessageStartEvent',
                isUserTask: el.type === 'UserTask',
                isServiceTask: el.type === 'ServiceTask',
                isScriptTask: el.type === 'ScriptTask',
                isManualTask: el.type === 'ManualTask',
                isBusinessRuleTask: el.type === 'BusinessRuleTask',
                isSendTask: el.type === 'SendTask',
                isReceiveTask: el.type === 'ReceiveTask',
                isExclusiveGateway: el.type === 'ExclusiveGateway',
                isParallelGateway: el.type === 'ParallelGateway',
                isInclusiveGateway: el.type === 'InclusiveGateway',
                isEventBasedGateway: el.type === 'EventBasedGateway',
                isSubProcess: el.type === 'SubProcess',
                isCallActivity: el.type === 'CallActivity',
                isDataObject: el.type === 'DataObject',
                isDataStore: el.type === 'DataStore',
                isTextAnnotation: el.type === 'TextAnnotation',
                isGroup: el.type === 'Group'
            }))
        }));
    }
    
    // =========================================================================
    // EVENT HANDLERS
    // =========================================================================
    
    handleSearchChange(event) {
        this.searchTerm = event.target.value;
    }
    
    handleClearSearch() {
        this.searchTerm = '';
    }
    
    handleCategoryToggle(event) {
        const categoryId = event.currentTarget.dataset.categoryid;
        this.categories = this.categories.map(cat => {
            if (cat.id === categoryId) {
                return { ...cat, expanded: !cat.expanded };
            }
            return cat;
        });
    }
    
    // =========================================================================
    // DRAG AND DROP
    // =========================================================================
    
    handleDragStart(event) {
        const elementType = event.currentTarget.dataset.type;
        const elementName = event.currentTarget.dataset.name;
        
        event.dataTransfer.setData('elementType', elementType);
        event.dataTransfer.setData('elementName', elementName);
        event.dataTransfer.effectAllowed = 'copy';
        
        event.currentTarget.classList.add('dragging');
    }
    
    handleDragEnd(event) {
        event.currentTarget.classList.remove('dragging');
    }
    
    handleElementClick(event) {
        const elementType = event.currentTarget.dataset.type;
        const elementName = event.currentTarget.dataset.name;
        
        this.dispatchEvent(new CustomEvent('elementselect', {
            detail: { elementType, elementName }
        }));
    }
}
