/**
 * @description Palette component with draggable BPMN elements including Salesforce Flow types
 * @author Dennis van Musschenbroek (DvM) - Cobra CRM B.V.
 * @date 2024-12-14
 * @version 1.1.0
 * 
 * EXPLANATION:
 * This component provides a categorized palette of BPMN 2.0 elements that can
 * be dragged onto the canvas. All computed values are pre-calculated in getters
 * because LWC templates don't support inline expressions.
 * 
 * Categories:
 * - Events: Start, End, Intermediate, Timer, Message, Signal, Error
 * - Tasks: User, Service, Script, Manual, Business Rule, Send, Receive
 * - Salesforce Flow: Screen, Record CRUD, Assignment, Action, Loop, Wait
 * - Gateways: Exclusive, Parallel, Inclusive, Event-Based, Complex
 * - Containers: Pool, Lane, Sub-Process, Call Activity
 * - Data & Artifacts: Data Object, Data Store, Text Annotation, Group
 * 
 * CHANGELOG:
 * Version | Date       | Author | Description
 * --------|------------|--------|------------------------------------------
 * 1.0.0   | 2024-12-12 | DvM    | Initial creation - element palette
 * 1.0.1   | 2024-12-12 | DvM    | Fixed: pre-calculate all template expressions
 * 1.1.0   | 2024-12-14 | DvM    | Added: Salesforce Flow elements category
 *                                 Added: Pool, Lane, Complex Gateway
 *                                 Added: Signal, Error, Terminate events
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
                { type: 'TimerIntermediateEvent', name: 'Timer Wait', description: 'Wait for time duration' },
                { type: 'MessageStartEvent', name: 'Message Start', description: 'Process triggered by message' },
                { type: 'MessageEndEvent', name: 'Message End', description: 'Send message at end' },
                { type: 'SignalStartEvent', name: 'Signal Start', description: 'Platform Event triggered' },
                { type: 'SignalEndEvent', name: 'Signal End', description: 'Publish Platform Event' },
                { type: 'ErrorEndEvent', name: 'Error End', description: 'End with error/fault' },
                { type: 'TerminateEndEvent', name: 'Terminate', description: 'Terminate all paths' }
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
            id: 'salesforce',
            name: 'Salesforce Flow',
            icon: 'utility:flow',
            expanded: true,
            elements: [
                { type: 'ScreenTask', name: 'Screen', description: 'Flow Screen for user input' },
                { type: 'RecordCreateTask', name: 'Create Records', description: 'Create Salesforce records' },
                { type: 'RecordUpdateTask', name: 'Update Records', description: 'Update Salesforce records' },
                { type: 'RecordDeleteTask', name: 'Delete Records', description: 'Delete Salesforce records' },
                { type: 'RecordLookupTask', name: 'Get Records', description: 'Query Salesforce records' },
                { type: 'AssignmentTask', name: 'Assignment', description: 'Set variable values' },
                { type: 'ActionCallTask', name: 'Action', description: 'Invoke Apex, Flow, or Action' },
                { type: 'LoopTask', name: 'Loop', description: 'Iterate over collection' },
                { type: 'WaitEvent', name: 'Pause', description: 'Pause and resume later' }
            ]
        },
        {
            id: 'gateways',
            name: 'Gateways',
            icon: 'utility:routing_offline',
            expanded: true,
            elements: [
                { type: 'ExclusiveGateway', name: 'Exclusive (XOR)', description: 'XOR - One path taken based on condition' },
                { type: 'ParallelGateway', name: 'Parallel (AND)', description: 'AND - All paths taken simultaneously' },
                { type: 'InclusiveGateway', name: 'Inclusive (OR)', description: 'OR - One or more paths taken' },
                { type: 'EventBasedGateway', name: 'Event-Based', description: 'Path determined by event occurrence' },
                { type: 'ComplexGateway', name: 'Complex', description: 'Complex routing logic' }
            ]
        },
        {
            id: 'swimlanes',
            name: 'Swimlanes',
            icon: 'utility:layout',
            expanded: false,
            elements: [
                { type: 'Pool', name: 'Pool', description: 'Participant/Organization container' },
                { type: 'Lane', name: 'Lane', description: 'Role/Department within pool' }
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
                        el.description.toLowerCase().includes(term) ||
                        el.type.toLowerCase().includes(term)
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
                // Events
                isStartEvent: el.type === 'StartEvent',
                isEndEvent: el.type === 'EndEvent',
                isIntermediateEvent: el.type === 'IntermediateEvent',
                isTimerStartEvent: el.type === 'TimerStartEvent',
                isTimerIntermediateEvent: el.type === 'TimerIntermediateEvent',
                isMessageStartEvent: el.type === 'MessageStartEvent',
                isMessageEndEvent: el.type === 'MessageEndEvent',
                isSignalStartEvent: el.type === 'SignalStartEvent',
                isSignalEndEvent: el.type === 'SignalEndEvent',
                isErrorEndEvent: el.type === 'ErrorEndEvent',
                isTerminateEndEvent: el.type === 'TerminateEndEvent',
                isWaitEvent: el.type === 'WaitEvent',
                
                // Standard Tasks
                isUserTask: el.type === 'UserTask',
                isServiceTask: el.type === 'ServiceTask',
                isScriptTask: el.type === 'ScriptTask',
                isManualTask: el.type === 'ManualTask',
                isBusinessRuleTask: el.type === 'BusinessRuleTask',
                isSendTask: el.type === 'SendTask',
                isReceiveTask: el.type === 'ReceiveTask',
                
                // Salesforce Tasks
                isScreenTask: el.type === 'ScreenTask',
                isRecordCreateTask: el.type === 'RecordCreateTask',
                isRecordUpdateTask: el.type === 'RecordUpdateTask',
                isRecordDeleteTask: el.type === 'RecordDeleteTask',
                isRecordLookupTask: el.type === 'RecordLookupTask',
                isAssignmentTask: el.type === 'AssignmentTask',
                isActionCallTask: el.type === 'ActionCallTask',
                isLoopTask: el.type === 'LoopTask',
                
                // Gateways
                isExclusiveGateway: el.type === 'ExclusiveGateway',
                isParallelGateway: el.type === 'ParallelGateway',
                isInclusiveGateway: el.type === 'InclusiveGateway',
                isEventBasedGateway: el.type === 'EventBasedGateway',
                isComplexGateway: el.type === 'ComplexGateway',
                
                // Swimlanes
                isPool: el.type === 'Pool',
                isLane: el.type === 'Lane',
                
                // Sub-Processes
                isSubProcess: el.type === 'SubProcess',
                isCallActivity: el.type === 'CallActivity',
                
                // Data & Artifacts
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
    // IMPORT FROM SALESFORCE
    // =========================================================================
    
    handleImportClick() {
        // Dispatch event to parent (processModeler) to open import modal
        this.dispatchEvent(new CustomEvent('importclick', {
            bubbles: true,
            composed: true
        }));
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