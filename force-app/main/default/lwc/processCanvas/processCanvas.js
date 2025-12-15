/**
 * @description SVG Canvas component for rendering and editing BPMN process diagrams
 * @author Dennis van Musschenbroek (DvM) - Cobra CRM B.V.
 * @date 2024-12-14
 * @version 1.1.1
 * 
 * EXPLANATION:
 * This is the core canvas component for the Process Modeling Studio. It provides:
 * - SVG-based rendering of BPMN 2.0 elements (events, tasks, gateways)
 * - Interactive editing: drag shapes, draw connections, select/delete
 * - Pan and zoom for navigating large diagrams
 * - Keyboard shortcuts for common operations
 * - Canvas state management (JSON serialization)
 * - Process Quality Scoring based on CFC (Control-Flow Complexity) metrics
 * 
 * PAN MODES:
 * - Middle mouse button: Always pans
 * - Shift + left click drag: Pans
 * - Left click drag on background: Pans (and clears selection)
 * 
 * ZOOM IMPLEMENTATION:
 * - The viewBox defines the visible area of the SVG
 * - Zooming in = smaller viewBox (see less, things appear bigger)
 * - Zooming out = larger viewBox (see more, things appear smaller)
 * - We store a base viewBox and apply zoom to calculate actual viewBox
 * 
 * CONNECTION DRAWING:
 * - Click on a connection point to start drawing
 * - Mouse move updates the temporary line endpoint
 * - Mouse up on another element creates the connection
 * - Escape or mouse up on empty area cancels
 * 
 * CFC SCORING (Academic Foundation):
 * Based on Cardoso et al. (2008) CFC metric and Mendling et al. (2010) 7PMG guidelines:
 * - XOR gateways: CFC = fan-out (each path is a different mental state)
 * - AND gateways: CFC = 1 (CONSTANT - all paths execute, ONE mental state)
 * - OR gateways: CFC = 2^fan-out - 1 (EXPONENTIAL - any combination possible)
 * 
 * CHANGELOG:
 * Version | Date       | Author | Description
 * --------|------------|--------|------------------------------------------
 * 1.0.0   | 2024-12-12 | DvM    | Initial creation - core canvas functionality
 * 1.0.1   | 2024-12-12 | DvM    | Fixed: pre-calculate all SVG attributes
 * 1.0.2   | 2024-12-12 | DvM    | Fixed: zoom now scales viewBox, connection drawing works
 * 1.1.0   | 2024-12-14 | DvM    | Added: Process Quality Scoring with CFC metrics
 * 1.1.1   | 2024-12-14 | DvM    | Fixed: Pan mode (shift+drag, background drag)
 *                                 Added: handleCanvasMouseLeave handler
 */
import { LightningElement, api, track } from 'lwc';

// =========================================================================
// BPMN ELEMENT TYPES - With CFC (Control-Flow Complexity) Properties
// =========================================================================
const ELEMENT_TYPES = {
    // Events - Light green fill, dark stroke - No CFC contribution
    StartEvent: { 
        width: 50, height: 50, shape: 'circle', 
        fill: '#C6F6D5', stroke: '#2D3748', strokeWidth: 2,
        isGateway: false, cfcFormula: null
    },
    EndEvent: { 
        width: 50, height: 50, shape: 'circle', 
        fill: '#FED7D7', stroke: '#2D3748', strokeWidth: 3,
        isGateway: false, cfcFormula: null
    },
    IntermediateEvent: { 
        width: 50, height: 50, shape: 'circle', 
        fill: '#BEE3F8', stroke: '#2D3748', strokeWidth: 2, double: true,
        isGateway: false, cfcFormula: null
    },
    TimerStartEvent: { 
        width: 50, height: 50, shape: 'circle', 
        fill: '#C6F6D5', stroke: '#2D3748', strokeWidth: 2, icon: 'timer',
        isGateway: false, cfcFormula: null
    },
    MessageStartEvent: { 
        width: 50, height: 50, shape: 'circle', 
        fill: '#C6F6D5', stroke: '#2D3748', strokeWidth: 2, icon: 'message',
        isGateway: false, cfcFormula: null
    },
    
    // Tasks - Light blue fill, dark stroke, rounded corners
    UserTask: { 
        width: 140, height: 70, shape: 'rect', 
        fill: '#BEE3F8', stroke: '#2D3748', strokeWidth: 2, rx: 12, icon: 'user',
        isGateway: false, cfcFormula: null
    },
    ServiceTask: { 
        width: 140, height: 70, shape: 'rect', 
        fill: '#BEE3F8', stroke: '#2D3748', strokeWidth: 2, rx: 12, icon: 'service',
        isGateway: false, cfcFormula: null
    },
    ScriptTask: { 
        width: 140, height: 70, shape: 'rect', 
        fill: '#BEE3F8', stroke: '#2D3748', strokeWidth: 2, rx: 12, icon: 'script',
        isGateway: false, cfcFormula: null
    },
    ManualTask: { 
        width: 140, height: 70, shape: 'rect', 
        fill: '#BEE3F8', stroke: '#2D3748', strokeWidth: 2, rx: 12, icon: 'manual',
        isGateway: false, cfcFormula: null
    },
    BusinessRuleTask: { 
        width: 140, height: 70, shape: 'rect', 
        fill: '#BEE3F8', stroke: '#2D3748', strokeWidth: 2, rx: 12, icon: 'rule',
        isGateway: false, cfcFormula: null
    },
    SendTask: { 
        width: 140, height: 70, shape: 'rect', 
        fill: '#BEE3F8', stroke: '#2D3748', strokeWidth: 2, rx: 12, icon: 'send',
        isGateway: false, cfcFormula: null
    },
    ReceiveTask: { 
        width: 140, height: 70, shape: 'rect', 
        fill: '#BEE3F8', stroke: '#2D3748', strokeWidth: 2, rx: 12, icon: 'receive',
        isGateway: false, cfcFormula: null
    },
    
    // Gateways - Light yellow fill, dark stroke - CFC Contributors
    ExclusiveGateway: { 
        width: 50, height: 50, shape: 'diamond', 
        fill: '#FEFCBF', stroke: '#2D3748', strokeWidth: 2, icon: 'x',
        isGateway: true,
        cfcType: 'XOR',
        cfcFormula: (fanout) => fanout,
        complexityDescription: 'Each branch is a separate decision path'
    },
    ParallelGateway: { 
        width: 50, height: 50, shape: 'diamond', 
        fill: '#FEFCBF', stroke: '#2D3748', strokeWidth: 2, icon: 'plus',
        isGateway: true,
        cfcType: 'AND',
        cfcFormula: () => 1,
        complexityDescription: 'All branches execute in parallel - low cognitive load'
    },
    InclusiveGateway: { 
        width: 50, height: 50, shape: 'diamond', 
        fill: '#FEFCBF', stroke: '#2D3748', strokeWidth: 2, icon: 'o',
        isGateway: true,
        cfcType: 'OR',
        cfcFormula: (fanout) => Math.pow(2, fanout) - 1,
        complexityDescription: 'Any combination of branches can execute - exponential complexity!',
        isHighRisk: true
    },
    EventBasedGateway: { 
        width: 50, height: 50, shape: 'diamond', 
        fill: '#FEFCBF', stroke: '#2D3748', strokeWidth: 2, icon: 'pentagon',
        isGateway: true,
        cfcType: 'XOR',
        cfcFormula: (fanout) => fanout,
        complexityDescription: 'Waits for first event - treated as exclusive choice'
    },
    
    // Sub-Process - Light purple fill
    SubProcess: { 
        width: 160, height: 100, shape: 'rect', 
        fill: '#E9D8FD', stroke: '#2D3748', strokeWidth: 2, rx: 12, dashed: true,
        isGateway: false, cfcFormula: null
    },
    CallActivity: { 
        width: 140, height: 70, shape: 'rect', 
        fill: '#E9D8FD', stroke: '#2D3748', strokeWidth: 3, rx: 12,
        isGateway: false, cfcFormula: null
    },
    
    // Data - Light gray fill
    DataObject: { 
        width: 40, height: 50, shape: 'document', 
        fill: '#EDF2F7', stroke: '#2D3748', strokeWidth: 1.5,
        isGateway: false, cfcFormula: null
    },
    DataStore: { 
        width: 50, height: 50, shape: 'cylinder', 
        fill: '#EDF2F7', stroke: '#2D3748', strokeWidth: 1.5,
        isGateway: false, cfcFormula: null
    },
    
    // Artifacts
    TextAnnotation: { 
        width: 120, height: 60, shape: 'annotation', 
        fill: '#FFFAF0', stroke: '#2D3748', strokeWidth: 1,
        isGateway: false, cfcFormula: null
    },
    Group: { 
        width: 200, height: 150, shape: 'rect', 
        fill: 'none', stroke: '#718096', strokeWidth: 1.5, dashed: true, rx: 12,
        isGateway: false, cfcFormula: null
    },
    
    // =========================================================================
    // ADDITIONAL EVENT TYPES - For Salesforce Flow Mapping
    // =========================================================================
    
    // Message Events (Record-Triggered Flows)
    MessageIntermediateCatchEvent: { 
        width: 50, height: 50, shape: 'circle', 
        fill: '#FFFFFF', stroke: '#2D3748', strokeWidth: 2, double: true, icon: 'envelope',
        isGateway: false, cfcFormula: null,
        eventType: 'message', eventPosition: 'intermediate',
        salesforceMapping: 'FlowWait'
    },
    MessageEndEvent: { 
        width: 50, height: 50, shape: 'circle', 
        fill: '#FED7D7', stroke: '#2D3748', strokeWidth: 3, icon: 'envelope',
        isGateway: false, cfcFormula: null,
        eventType: 'message', eventPosition: 'end',
        salesforceMapping: 'FlowActionCall'
    },
    
    // Timer Events (Scheduled Flows, Wait Elements)
    TimerIntermediateEvent: { 
        width: 50, height: 50, shape: 'circle', 
        fill: '#FFFFFF', stroke: '#2D3748', strokeWidth: 2, double: true, icon: 'timer',
        isGateway: false, cfcFormula: null,
        eventType: 'timer', eventPosition: 'intermediate',
        salesforceMapping: 'FlowWait'
    },
    
    // Signal Events (Platform Events)
    SignalStartEvent: { 
        width: 50, height: 50, shape: 'circle', 
        fill: '#C6F6D5', stroke: '#2D3748', strokeWidth: 2, icon: 'signal',
        isGateway: false, cfcFormula: null,
        eventType: 'signal', eventPosition: 'start',
        salesforceMapping: { triggerType: 'PlatformEvent' }
    },
    SignalIntermediateEvent: { 
        width: 50, height: 50, shape: 'circle', 
        fill: '#FFFFFF', stroke: '#2D3748', strokeWidth: 2, double: true, icon: 'signal',
        isGateway: false, cfcFormula: null,
        eventType: 'signal', eventPosition: 'intermediate'
    },
    SignalEndEvent: { 
        width: 50, height: 50, shape: 'circle', 
        fill: '#FED7D7', stroke: '#2D3748', strokeWidth: 3, icon: 'signal',
        isGateway: false, cfcFormula: null,
        eventType: 'signal', eventPosition: 'end',
        salesforceMapping: 'FlowActionCall'
    },
    
    // Error Events (Fault Paths)
    ErrorEndEvent: { 
        width: 50, height: 50, shape: 'circle', 
        fill: '#FED7D7', stroke: '#2D3748', strokeWidth: 3, icon: 'error',
        isGateway: false, cfcFormula: null,
        eventType: 'error', eventPosition: 'end',
        salesforceMapping: 'FlowCustomError'
    },
    ErrorBoundaryEvent: { 
        width: 36, height: 36, shape: 'circle', 
        fill: '#FFFFFF', stroke: '#C53030', strokeWidth: 2, double: true, icon: 'error',
        isGateway: false, cfcFormula: null,
        eventType: 'error', eventPosition: 'boundary', attachable: true,
        salesforceMapping: 'FaultConnector'
    },
    
    // Terminate Event
    TerminateEndEvent: { 
        width: 50, height: 50, shape: 'circle', 
        fill: '#FED7D7', stroke: '#2D3748', strokeWidth: 3, icon: 'terminate',
        isGateway: false, cfcFormula: null,
        eventType: 'terminate', eventPosition: 'end'
    },
    
    // =========================================================================
    // ADDITIONAL GATEWAY TYPES
    // =========================================================================
    
    ComplexGateway: { 
        width: 50, height: 50, shape: 'diamond', 
        fill: '#FEFCBF', stroke: '#2D3748', strokeWidth: 2, icon: 'asterisk',
        isGateway: true,
        cfcType: 'COMPLEX',
        cfcFormula: (fanout) => Math.pow(2, fanout) - 1,
        complexityDescription: 'Complex routing with custom conditions - exponential complexity',
        isHighRisk: true,
        salesforceMapping: 'FlowDecision'
    },
    
    // =========================================================================
    // POOL & LANE (Container Elements for Orchestration)
    // Supports horizontal (default) and vertical orientation
    // Resizable with minimum dimensions enforced
    // =========================================================================
    
    Pool: { 
        width: 800, height: 300, 
        minWidth: 300, minHeight: 150,
        maxWidth: 2000, maxHeight: 1500,
        shape: 'pool', 
        fill: '#FFFFFF', stroke: '#2D3748', strokeWidth: 2,
        headerSize: 30, // Width for horizontal, Height for vertical
        isContainer: true, isResizable: true,
        isGateway: false, cfcFormula: null,
        salesforceMapping: 'FlowOrchestration'
    },
    Lane: { 
        width: 770, height: 150, 
        minWidth: 300, minHeight: 80,
        maxWidth: 2000, maxHeight: 800,
        shape: 'lane', 
        fill: '#F7FAFC', stroke: '#CBD5E0', strokeWidth: 1,
        headerSize: 30,
        isContainer: true, isResizable: true,
        isGateway: false, cfcFormula: null,
        parentType: 'Pool',
        salesforceMapping: 'FlowOrchestratedStage'
    },
    
    // =========================================================================
    // SALESFORCE-SPECIFIC TASK TYPES
    // =========================================================================
    
    // Record Operations (maps to Salesforce record elements)
    RecordCreateTask: { 
        width: 140, height: 70, shape: 'rect', 
        fill: '#C6F6D5', stroke: '#2D3748', strokeWidth: 2, rx: 12, icon: 'create',
        isGateway: false, cfcFormula: null,
        salesforceMapping: 'FlowRecordCreate'
    },
    RecordUpdateTask: { 
        width: 140, height: 70, shape: 'rect', 
        fill: '#BEE3F8', stroke: '#2D3748', strokeWidth: 2, rx: 12, icon: 'update',
        isGateway: false, cfcFormula: null,
        salesforceMapping: 'FlowRecordUpdate'
    },
    RecordDeleteTask: { 
        width: 140, height: 70, shape: 'rect', 
        fill: '#FED7D7', stroke: '#2D3748', strokeWidth: 2, rx: 12, icon: 'delete',
        isGateway: false, cfcFormula: null,
        salesforceMapping: 'FlowRecordDelete'
    },
    RecordLookupTask: { 
        width: 140, height: 70, shape: 'rect', 
        fill: '#E9D8FD', stroke: '#2D3748', strokeWidth: 2, rx: 12, icon: 'lookup',
        isGateway: false, cfcFormula: null,
        salesforceMapping: 'FlowRecordLookup'
    },
    
    // Assignment (Variable manipulation)
    AssignmentTask: { 
        width: 140, height: 70, shape: 'rect', 
        fill: '#FEEBC8', stroke: '#2D3748', strokeWidth: 2, rx: 12, icon: 'assignment',
        isGateway: false, cfcFormula: null,
        salesforceMapping: 'FlowAssignment'
    },
    
    // Loop (Iteration)
    LoopTask: { 
        width: 160, height: 100, shape: 'rect', 
        fill: '#E9D8FD', stroke: '#2D3748', strokeWidth: 2, rx: 12, icon: 'loop', dashed: true,
        isGateway: false, cfcFormula: null,
        incrementsNesting: true,
        salesforceMapping: 'FlowLoop'
    },
    
    // Action Call (Invocable Actions)
    ActionCallTask: { 
        width: 140, height: 70, shape: 'rect', 
        fill: '#FED7E2', stroke: '#2D3748', strokeWidth: 2, rx: 12, icon: 'action',
        isGateway: false, cfcFormula: null,
        salesforceMapping: 'FlowActionCall'
    },
    
    // Screen (User Interaction)
    ScreenTask: { 
        width: 140, height: 70, shape: 'rect', 
        fill: '#BEE3F8', stroke: '#2D3748', strokeWidth: 2, rx: 12, icon: 'screen',
        isGateway: false, cfcFormula: null,
        salesforceMapping: 'FlowScreen'
    },
    
    // Wait (Pause/Resume)
    WaitEvent: { 
        width: 50, height: 50, shape: 'circle', 
        fill: '#FEEBC8', stroke: '#2D3748', strokeWidth: 2, double: true, icon: 'pause',
        isGateway: false, cfcFormula: null,
        eventType: 'timer', eventPosition: 'intermediate',
        salesforceMapping: 'FlowWait'
    }
};

// =========================================================================
// SALESFORCE FLOW TO BPMN ELEMENT MAPPING
// =========================================================================
const FLOW_ELEMENT_MAP = {
    // Start types based on trigger
    'start': 'StartEvent',
    'start_RecordBeforeSave': 'MessageStartEvent',
    'start_RecordAfterSave': 'MessageStartEvent',
    'start_Scheduled': 'TimerStartEvent',
    'start_PlatformEvent': 'SignalStartEvent',
    
    // Flow Elements
    'FlowScreen': 'ScreenTask',
    'FlowDecision': 'ExclusiveGateway',
    'FlowRecordCreate': 'RecordCreateTask',
    'FlowRecordUpdate': 'RecordUpdateTask',
    'FlowRecordDelete': 'RecordDeleteTask',
    'FlowRecordLookup': 'RecordLookupTask',
    'FlowAssignment': 'AssignmentTask',
    'FlowActionCall': 'ActionCallTask',
    'FlowSubflow': 'CallActivity',
    'FlowLoop': 'LoopTask',
    'FlowWait': 'WaitEvent',
    'FlowCustomError': 'ErrorEndEvent',
    'FlowOrchestratedStage': 'Lane',
    
    // Fallbacks
    'default': 'ServiceTask'
};

// Connection type styles
const CONNECTION_TYPES = {
    SequenceFlow: { stroke: '#2D3748', strokeWidth: 2, markerEnd: 'arrow' },
    ConditionalFlow: { stroke: '#2D3748', strokeWidth: 2, markerEnd: 'arrow', markerStart: 'diamond' },
    DefaultFlow: { stroke: '#2D3748', strokeWidth: 2, markerEnd: 'arrow', slash: true },
    MessageFlow: { stroke: '#2D3748', strokeWidth: 2, markerEnd: 'arrow', dashed: true },
    Association: { stroke: '#718096', strokeWidth: 1.5, dashed: true },
    DataAssociation: { stroke: '#718096', strokeWidth: 1.5, dashed: true, markerEnd: 'arrow' }
};

export default class ProcessCanvas extends LightningElement {
    // =========================================================================
    // PUBLIC API
    // =========================================================================
    
    @api processId;
    @api readOnly = false;
    
    @api
    getCanvasState() {
        return JSON.stringify({
            elements: this.elements,
            connections: this.connections,
            viewBox: this.baseViewBox,
            zoom: this.zoom
        });
    }
    
    @api
    setCanvasState(jsonState) {
        try {
            const state = JSON.parse(jsonState);
            this.elements = state.elements || [];
            this.connections = state.connections || [];
            this.baseViewBox = state.viewBox || { x: 0, y: 0, width: 1200, height: 800 };
            this.zoom = state.zoom || 1;
        } catch (e) {
            console.error('Error parsing canvas state:', e);
        }
    }
    
    @api
    addElement(elementType, x, y, name, salesforceMetadata = null, options = {}) {
        const typeConfig = ELEMENT_TYPES[elementType];
        if (!typeConfig) {
            console.error('Unknown element type:', elementType);
            return null;
        }
        
        // Handle orientation for Pool/Lane (default: horizontal)
        const orientation = options.orientation || 'horizontal';
        let width = typeConfig.width;
        let height = typeConfig.height;
        
        // Swap dimensions for vertical orientation
        if ((typeConfig.shape === 'pool' || typeConfig.shape === 'lane') && orientation === 'vertical') {
            width = typeConfig.height;
            height = typeConfig.width;
        }
        
        const element = {
            id: this.generateId('el'),
            type: elementType,
            name: name || this.getDefaultName(elementType),
            x: x,
            y: y,
            width: width,
            height: height,
            description: '',
            assignedRole: '',
            durationHours: null,
            slaHours: null,
            lane: '', // Parent lane ID if inside a lane
            
            // Pool/Lane specific properties
            orientation: (typeConfig.shape === 'pool' || typeConfig.shape === 'lane') ? orientation : null,
            
            // Salesforce metadata (populated during import or manual entry)
            salesforceMetadata: salesforceMetadata || {
                apiName: '',
                flowElementType: '',
                actionType: '',
                actionName: '',
                triggerType: '',
                triggerObject: '',
                objectApiName: '',
                recordFilters: [],
                inputAssignments: [],
                outputAssignments: [],
                processType: '',
                apexClassName: '',
                apexMethodName: '',
                lwcComponentName: '',
                isImported: false,
                sourceFile: '',
                faultConnector: null
            }
        };
        
        this.elements = [...this.elements, element];
        this.selectElement(element.id);
        this.notifyCanvasChange();
        
        return element.id;
    }
    
    @api
    deleteSelectedElement() {
        if (!this.selectedElementId) return;
        this.deleteElement(this.selectedElementId);
    }
    
    @api
    deleteSelectedConnection() {
        if (!this.selectedConnectionId) return;
        this.deleteConnection(this.selectedConnectionId);
    }
    
    @api
    deleteSelected() {
        if (this.selectedElementId) {
            this.deleteElement(this.selectedElementId);
        } else if (this.selectedConnectionId) {
            this.deleteConnection(this.selectedConnectionId);
        }
    }
    
    @api
    resetZoom() {
        this.zoom = 1;
        this.baseViewBox = { x: 0, y: 0, width: 1200, height: 800 };
    }
    
    @api
    zoomIn() {
        this.zoom = Math.min(4, this.zoom * 1.2);
    }
    
    @api
    zoomOut() {
        this.zoom = Math.max(0.25, this.zoom / 1.2);
    }
    
    @api
    zoomFit() {
        // TODO: Calculate zoom to fit all elements
        this.resetZoom();
    }
    
    // =========================================================================
    // SALESFORCE IMPORT/EXPORT METHODS
    // =========================================================================
    
    /**
     * Import Salesforce Flow metadata and convert to BPMN elements
     * @param {Object} flowData - The Flow metadata from Tooling API (JSON format)
     * @param {Object} options - Import options { clearCanvas: boolean, autoLayout: boolean }
     * @returns {Object} { elements: [], connections: [], metadata: {} }
     */
    @api
    importFromSalesforce(flowData, options = { clearCanvas: true, autoLayout: true }) {
        const result = {
            elements: [],
            connections: [],
            metadata: {
                apiName: flowData.apiName || flowData.fullName || '',
                label: flowData.label || '',
                processType: flowData.processType || '',
                triggerType: flowData.start?.triggerType || '',
                triggerObject: flowData.start?.object || ''
            }
        };
        
        // Store imported flow metadata for display
        this.importedFlowName = flowData.apiName || flowData.fullName || '';
        this.importedFlowLabel = flowData.label || flowData.apiName || '';
        this.importedFlowType = flowData.processType || '';
        
        // Clear canvas if requested
        if (options.clearCanvas) {
            this.elements = [];
            this.connections = [];
        }
        
        // Track element name to ID mapping for connections
        const elementNameToId = new Map();
        
        // Starting position for layout
        let currentX = 100;
        let currentY = 100;
        const HORIZONTAL_SPACING = 180;
        const VERTICAL_SPACING = 120;
        
        // 1. Create Start Event based on trigger type
        const startType = this.mapFlowStartType(flowData.start?.triggerType);
        const startId = this.addElement(startType, currentX, currentY, 'Start', {
            apiName: 'start',
            flowElementType: 'FlowStart',
            triggerType: flowData.start?.triggerType || '',
            triggerObject: flowData.start?.object || '',
            processType: flowData.processType || '',
            isImported: true,
            sourceFile: flowData.apiName || ''
        });
        elementNameToId.set('start', startId);
        if (flowData.start?.connector?.targetReference) {
            elementNameToId.set('__startTarget__', flowData.start.connector.targetReference);
        }
        result.elements.push(startId);
        
        currentX += HORIZONTAL_SPACING;
        
        // 2. Process all Flow elements
        const flowElementTypes = [
            { key: 'screens', type: 'FlowScreen' },
            { key: 'decisions', type: 'FlowDecision' },
            { key: 'recordCreates', type: 'FlowRecordCreate' },
            { key: 'recordUpdates', type: 'FlowRecordUpdate' },
            { key: 'recordDeletes', type: 'FlowRecordDelete' },
            { key: 'recordLookups', type: 'FlowRecordLookup' },
            { key: 'assignments', type: 'FlowAssignment' },
            { key: 'actionCalls', type: 'FlowActionCall' },
            { key: 'subflows', type: 'FlowSubflow' },
            { key: 'loops', type: 'FlowLoop' },
            { key: 'waits', type: 'FlowWait' }
        ];
        
        flowElementTypes.forEach(({ key, type }) => {
            const elements = flowData[key];
            if (!elements) return;
            
            // Handle both array and single object
            const elementArray = Array.isArray(elements) ? elements : [elements];
            
            elementArray.forEach((flowEl, index) => {
                if (!flowEl || !flowEl.name) return;
                
                const bpmnType = FLOW_ELEMENT_MAP[type] || 'ServiceTask';
                
                // Calculate position (simple grid layout)
                const row = Math.floor((result.elements.length - 1) / 5);
                const col = (result.elements.length - 1) % 5;
                const posX = currentX + (col * HORIZONTAL_SPACING);
                const posY = currentY + (row * VERTICAL_SPACING);
                
                // Build Salesforce metadata
                const sfMetadata = {
                    apiName: flowEl.name,
                    flowElementType: type,
                    actionType: flowEl.actionType || '',
                    actionName: flowEl.actionName || '',
                    objectApiName: flowEl.object || flowEl.objectApiName || '',
                    processType: flowData.processType || '',
                    isImported: true,
                    sourceFile: flowData.apiName || '',
                    faultConnector: flowEl.faultConnector?.targetReference || null
                };
                
                // Handle specific element types
                if (type === 'FlowActionCall' && flowEl.actionType === 'apex') {
                    sfMetadata.apexClassName = flowEl.actionName || '';
                }
                
                if (type === 'FlowScreen' && flowEl.fields) {
                    // Check for LWC components in screen fields
                    const lwcField = (Array.isArray(flowEl.fields) ? flowEl.fields : [flowEl.fields])
                        .find(f => f.extensionName);
                    if (lwcField) {
                        sfMetadata.lwcComponentName = lwcField.extensionName;
                    }
                }
                
                const elementId = this.addElement(
                    bpmnType, 
                    posX, 
                    posY, 
                    flowEl.label || flowEl.name,
                    sfMetadata
                );
                
                elementNameToId.set(flowEl.name, elementId);
                result.elements.push(elementId);
                
                // Store connector targets for later connection creation
                if (flowEl.connector?.targetReference) {
                    this._pendingConnections = this._pendingConnections || [];
                    this._pendingConnections.push({
                        sourceId: elementId,
                        targetName: flowEl.connector.targetReference,
                        type: 'SequenceFlow'
                    });
                }
                
                // Handle decision outcomes (multiple connectors)
                if (type === 'FlowDecision' && flowEl.rules) {
                    const rules = Array.isArray(flowEl.rules) ? flowEl.rules : [flowEl.rules];
                    rules.forEach(rule => {
                        if (rule.connector?.targetReference) {
                            this._pendingConnections = this._pendingConnections || [];
                            this._pendingConnections.push({
                                sourceId: elementId,
                                targetName: rule.connector.targetReference,
                                type: 'ConditionalFlow',
                                label: rule.label || rule.name
                            });
                        }
                    });
                    // Default outcome
                    if (flowEl.defaultConnector?.targetReference) {
                        this._pendingConnections = this._pendingConnections || [];
                        this._pendingConnections.push({
                            sourceId: elementId,
                            targetName: flowEl.defaultConnector.targetReference,
                            type: 'DefaultFlow',
                            label: 'Default'
                        });
                    }
                }
                
                // Handle fault connectors
                if (flowEl.faultConnector?.targetReference) {
                    this._pendingConnections = this._pendingConnections || [];
                    this._pendingConnections.push({
                        sourceId: elementId,
                        targetName: flowEl.faultConnector.targetReference,
                        type: 'SequenceFlow',
                        isFault: true
                    });
                }
            });
        });
        
        // 3. Create End Event if needed
        const endId = this.addElement('EndEvent', currentX + (5 * HORIZONTAL_SPACING), currentY, 'End', {
            apiName: 'end',
            flowElementType: 'FlowEnd',
            isImported: true,
            sourceFile: flowData.apiName || ''
        });
        elementNameToId.set('end', endId);
        result.elements.push(endId);
        
        // 4. Create connections from pending list
        if (this._pendingConnections) {
            // Add start connection
            const startTargetName = elementNameToId.get('__startTarget__');
            if (startTargetName) {
                const targetId = elementNameToId.get(startTargetName);
                if (targetId) {
                    this.addConnection(startId, targetId, 'SequenceFlow');
                    result.connections.push({ sourceId: startId, targetId });
                }
            }
            
            // Add all other connections
            this._pendingConnections.forEach(pending => {
                const targetId = elementNameToId.get(pending.targetName);
                if (targetId) {
                    this.addConnection(pending.sourceId, targetId, pending.type || 'SequenceFlow');
                    result.connections.push({
                        sourceId: pending.sourceId,
                        targetId,
                        type: pending.type,
                        label: pending.label
                    });
                }
            });
            
            // Clear pending connections
            this._pendingConnections = [];
        }
        
        // 4.5 Connect terminal elements to End event
        // Find elements with no outgoing connections (terminal nodes)
        // Build a fresh set from the current connections
        const elementsWithOutgoing = new Set();
        this.connections.forEach(conn => {
            elementsWithOutgoing.add(conn.sourceId);
        });
        
        // Debug: Log elements without outgoing connections
        console.log('Elements with outgoing connections:', elementsWithOutgoing.size);
        
        // Get all imported elements except Start and End
        const importedElements = this.elements.filter(el => 
            el.isImported && 
            el.id !== startId && 
            el.id !== endId &&
            !el.type.includes('Start') &&
            !el.type.includes('End')
        );
        
        // Connect terminal elements to End
        let terminalCount = 0;
        importedElements.forEach(el => {
            if (!elementsWithOutgoing.has(el.id)) {
                // This element has no outgoing connections - connect to End
                console.log('Connecting terminal element to End:', el.name, el.type);
                this.addConnection(el.id, endId, 'SequenceFlow');
                result.connections.push({
                    sourceId: el.id,
                    targetId: endId
                });
                terminalCount++;
            }
        });
        
        console.log('Connected', terminalCount, 'terminal elements to End');
        
        // If no terminal elements were found, the flow might be a loop or have all paths defined
        // In that case, find the last element in the flow and connect it to End if not already connected
        if (terminalCount === 0 && !elementsWithOutgoing.has(endId)) {
            // Find the element that appears last in the import order
            const lastImportedElement = importedElements[importedElements.length - 1];
            if (lastImportedElement && !elementsWithOutgoing.has(lastImportedElement.id)) {
                console.log('No terminal elements, connecting last element:', lastImportedElement.name);
                this.addConnection(lastImportedElement.id, endId, 'SequenceFlow');
                result.connections.push({
                    sourceId: lastImportedElement.id,
                    targetId: endId
                });
            }
        }
        
        // 5. Auto-layout if requested
        if (options.autoLayout) {
            this.autoLayoutElements();
        }
        
        // 6. Recalculate process quality score
        this.calculateProcessScore();
        
        // 7. Dispatch event
        this.dispatchEvent(new CustomEvent('flowimported', {
            detail: {
                elementCount: result.elements.length,
                connectionCount: result.connections.length,
                metadata: result.metadata
            }
        }));
        
        return result;
    }
    
    /**
     * Map Flow trigger type to BPMN Start Event type
     */
    mapFlowStartType(triggerType) {
        const mapping = {
            'RecordBeforeSave': 'MessageStartEvent',
            'RecordAfterSave': 'MessageStartEvent',
            'Scheduled': 'TimerStartEvent',
            'PlatformEvent': 'SignalStartEvent'
        };
        return mapping[triggerType] || 'StartEvent';
    }
    
    /**
     * Improved auto-layout algorithm for imported elements
     * Uses branch-aware positioning to prevent overlaps
     * 
     * KEY IMPROVEMENTS:
     * - Tracks branch paths from each gateway
     * - Assigns unique vertical lanes to each branch
     * - Handles merge points properly
     * - Increases spacing for complex flows
     */
    autoLayoutElements() {
        if (this.elements.length === 0) return;
        
        // =====================================================================
        // CONFIGURATION
        // =====================================================================
        const HORIZONTAL_SPACING = 200;  // Space between columns
        const VERTICAL_SPACING = 100;    // Base space between rows
        const BRANCH_SPACING = 120;      // Extra space for branches
        const START_X = 100;
        const START_Y = 100;
        const MIN_ELEMENT_WIDTH = 140;
        
        // =====================================================================
        // BUILD GRAPH STRUCTURES
        // =====================================================================
        const outgoingMap = new Map(); // elementId -> [targetIds]
        const incomingMap = new Map(); // elementId -> [sourceIds]
        const elementMap = new Map();  // elementId -> element
        
        this.elements.forEach(el => {
            elementMap.set(el.id, el);
            outgoingMap.set(el.id, []);
            incomingMap.set(el.id, []);
        });
        
        this.connections.forEach(conn => {
            if (outgoingMap.has(conn.sourceId)) {
                outgoingMap.get(conn.sourceId).push(conn.targetId);
            }
            if (incomingMap.has(conn.targetId)) {
                incomingMap.get(conn.targetId).push(conn.sourceId);
            }
        });
        
        // =====================================================================
        // FIND START ELEMENTS
        // =====================================================================
        let startElements = this.elements.filter(el => 
            el.type === 'StartEvent' || 
            el.type === 'TimerStartEvent' || 
            el.type === 'MessageStartEvent' ||
            el.type === 'SignalStartEvent'
        );
        
        if (startElements.length === 0) {
            startElements = this.elements.filter(el => 
                incomingMap.get(el.id)?.length === 0
            );
        }
        
        if (startElements.length === 0 && this.elements.length > 0) {
            startElements = [this.elements[0]];
        }
        
        // =====================================================================
        // PHASE 1: ASSIGN LEVELS (X positions) using BFS
        // =====================================================================
        const levels = new Map();
        const visited = new Set();
        const queue = [];
        
        startElements.forEach(el => {
            queue.push({ id: el.id, level: 0 });
            levels.set(el.id, 0);
        });
        
        while (queue.length > 0) {
            const { id, level } = queue.shift();
            
            if (visited.has(id)) continue;
            visited.add(id);
            
            const targets = outgoingMap.get(id) || [];
            targets.forEach(targetId => {
                const currentLevel = levels.get(targetId);
                const newLevel = level + 1;
                
                // Use maximum level (ensures proper left-to-right ordering)
                if (currentLevel === undefined || newLevel > currentLevel) {
                    levels.set(targetId, newLevel);
                }
                
                if (!visited.has(targetId)) {
                    queue.push({ id: targetId, level: newLevel });
                }
            });
        }
        
        // Handle disconnected elements
        this.elements.forEach(el => {
            if (!levels.has(el.id)) {
                const maxLevel = Math.max(...levels.values(), 0);
                levels.set(el.id, maxLevel + 1);
            }
        });
        
        // =====================================================================
        // PHASE 2: GROUP BY LEVEL
        // =====================================================================
        const levelGroups = new Map();
        levels.forEach((level, elId) => {
            if (!levelGroups.has(level)) {
                levelGroups.set(level, []);
            }
            levelGroups.get(level).push(elId);
        });
        
        const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b);
        
        // =====================================================================
        // PHASE 3: ASSIGN BRANCH LANES (Y positions)
        // Track which "lane" each element belongs to based on its branch path
        // =====================================================================
        const elementLanes = new Map(); // elementId -> lane number
        const branchStack = []; // Stack of active branches
        let nextLane = 0;
        
        // Process elements level by level
        sortedLevels.forEach(level => {
            const elementsAtLevel = levelGroups.get(level);
            
            elementsAtLevel.forEach(elId => {
                const el = elementMap.get(elId);
                const sources = incomingMap.get(elId) || [];
                const targets = outgoingMap.get(elId) || [];
                
                if (sources.length === 0) {
                    // Start element - assign to middle lane
                    elementLanes.set(elId, nextLane++);
                } else if (sources.length === 1) {
                    // Single predecessor - inherit its lane
                    const sourceLane = elementLanes.get(sources[0]);
                    if (sourceLane !== undefined) {
                        elementLanes.set(elId, sourceLane);
                    } else {
                        elementLanes.set(elId, nextLane++);
                    }
                } else {
                    // Multiple predecessors (merge point) - use average lane
                    let totalLane = 0;
                    let count = 0;
                    sources.forEach(srcId => {
                        const lane = elementLanes.get(srcId);
                        if (lane !== undefined) {
                            totalLane += lane;
                            count++;
                        }
                    });
                    elementLanes.set(elId, count > 0 ? Math.round(totalLane / count) : nextLane++);
                }
                
                // If this is a gateway with multiple outgoing, prepare branch lanes
                if (targets.length > 1) {
                    const baseLane = elementLanes.get(elId) || 0;
                    const halfSpread = (targets.length - 1) / 2;
                    
                    targets.forEach((targetId, idx) => {
                        // Spread branches evenly around the gateway's lane
                        const branchLane = baseLane + (idx - halfSpread);
                        if (!elementLanes.has(targetId)) {
                            elementLanes.set(targetId, branchLane);
                        }
                    });
                    
                    // Update nextLane to account for new branches
                    nextLane = Math.max(nextLane, baseLane + halfSpread + 1);
                }
            });
        });
        
        // =====================================================================
        // PHASE 4: NORMALIZE LANES (remove gaps, ensure positive)
        // =====================================================================
        const usedLanes = new Set(elementLanes.values());
        const sortedLanes = Array.from(usedLanes).sort((a, b) => a - b);
        const laneMapping = new Map();
        sortedLanes.forEach((lane, idx) => {
            laneMapping.set(lane, idx);
        });
        
        elementLanes.forEach((lane, elId) => {
            elementLanes.set(elId, laneMapping.get(lane) || 0);
        });
        
        // =====================================================================
        // PHASE 5: CALCULATE POSITIONS
        // =====================================================================
        const positions = new Map();
        const maxLane = Math.max(...elementLanes.values(), 0);
        const totalHeight = (maxLane + 1) * BRANCH_SPACING;
        
        this.elements.forEach(el => {
            const level = levels.get(el.id) || 0;
            const lane = elementLanes.get(el.id) || 0;
            
            positions.set(el.id, {
                x: START_X + (level * HORIZONTAL_SPACING),
                y: START_Y + (lane * BRANCH_SPACING)
            });
        });
        
        // =====================================================================
        // PHASE 6: COLLISION DETECTION & RESOLUTION
        // Check for overlapping elements and adjust
        // =====================================================================
        const ELEMENT_HEIGHT = 60;
        const MIN_Y_GAP = 80;
        
        sortedLevels.forEach(level => {
            const elementsAtLevel = levelGroups.get(level);
            
            // Sort by Y position
            elementsAtLevel.sort((a, b) => {
                const posA = positions.get(a);
                const posB = positions.get(b);
                return (posA?.y || 0) - (posB?.y || 0);
            });
            
            // Resolve overlaps
            for (let i = 1; i < elementsAtLevel.length; i++) {
                const prevId = elementsAtLevel[i - 1];
                const currId = elementsAtLevel[i];
                const prevPos = positions.get(prevId);
                const currPos = positions.get(currId);
                
                if (prevPos && currPos) {
                    const minY = prevPos.y + ELEMENT_HEIGHT + MIN_Y_GAP;
                    if (currPos.y < minY) {
                        currPos.y = minY;
                        positions.set(currId, currPos);
                    }
                }
            }
        });
        
        // =====================================================================
        // PHASE 7: CENTER THE DIAGRAM
        // =====================================================================
        let minY = Infinity;
        let maxY = -Infinity;
        positions.forEach(pos => {
            minY = Math.min(minY, pos.y);
            maxY = Math.max(maxY, pos.y);
        });
        
        const offsetY = START_Y - minY + 50; // Ensure minimum 50px from top
        
        // =====================================================================
        // PHASE 8: APPLY POSITIONS
        // =====================================================================
        this.elements = this.elements.map(el => {
            const pos = positions.get(el.id);
            if (pos) {
                // Also expand width for long labels
                const labelLength = (el.name || '').length;
                const neededWidth = Math.max(MIN_ELEMENT_WIDTH, Math.min(200, labelLength * 7));
                const newWidth = (el.type !== 'StartEvent' && el.type !== 'EndEvent' && 
                    !el.type?.includes('Gateway') && !el.type?.includes('Event'))
                    ? Math.max(el.width || 0, neededWidth)
                    : el.width;
                
                return {
                    ...el,
                    x: Math.max(50, pos.x),
                    y: Math.max(50, pos.y + offsetY),
                    width: newWidth || el.width
                };
            }
            return el;
        });
    }
    
    /**
     * Simple grid layout fallback when no start event exists
     */
    simpleGridLayout() {
        const COLS = 4;
        const HORIZONTAL_SPACING = 200;
        const VERTICAL_SPACING = 120;
        const START_X = 100;
        const START_Y = 100;
        
        this.elements.forEach((el, index) => {
            const col = index % COLS;
            const row = Math.floor(index / COLS);
            this.elements[index] = {
                ...el,
                x: START_X + (col * HORIZONTAL_SPACING),
                y: START_Y + (row * VERTICAL_SPACING)
            };
        });
        
        this.elements = [...this.elements];
    }
    
    /**
     * Center the diagram vertically in the canvas
     */
    centerDiagramVertically() {
        if (this.elements.length === 0) return;
        
        // Find Y bounds
        let minY = Infinity;
        let maxY = -Infinity;
        
        this.elements.forEach(el => {
            const typeConfig = ELEMENT_TYPES[el.type];
            const height = el.height || typeConfig?.height || 80;
            minY = Math.min(minY, el.y);
            maxY = Math.max(maxY, el.y + height);
        });
        
        // Calculate offset to center around y=200 (reasonable default)
        const diagramHeight = maxY - minY;
        const targetCenterY = 200;
        const currentCenterY = minY + (diagramHeight / 2);
        const offsetY = targetCenterY - currentCenterY;
        
        // Only adjust if diagram is too high or too low
        if (minY < 50 || minY > 300) {
            this.elements.forEach((el, index) => {
                this.elements[index] = {
                    ...el,
                    y: el.y + offsetY
                };
            });
        }
    }
    
    /**
     * Add a connection between two elements
     */
    addConnection(sourceId, targetId, type = 'SequenceFlow') {
        const connection = {
            id: this.generateId('conn'),
            sourceId,
            targetId,
            type,
            label: ''
        };
        this.connections = [...this.connections, connection];
        return connection.id;
    }
    
    @api
    updateSelectedElement(properties) {
        if (!this.selectedElementId) return;
        
        const index = this.elements.findIndex(el => el.id === this.selectedElementId);
        if (index === -1) return;
        
        this.elements[index] = { ...this.elements[index], ...properties };
        this.elements = [...this.elements];
        this.notifyCanvasChange();
    }
    
    // =========================================================================
    // PROCESS QUALITY SCORING - Academic Grade Implementation
    // =========================================================================
    // Based on:
    // - Cardoso (2006): Control-Flow Complexity (CFC) metric
    // - Mendling, Reijers, van der Aalst (2010): Seven Process Modeling Guidelines (7PMG)
    // - SAP Signavio: Multi-dimensional complexity scoring
    // =========================================================================
    
    /**
     * Get outgoing sequence flows from an element
     */
    getOutgoingFlows(elementId) {
        return this.connections.filter(c => c.sourceId === elementId);
    }
    
    /**
     * Get incoming sequence flows to an element
     */
    getIncomingFlows(elementId) {
        return this.connections.filter(c => c.targetId === elementId);
    }
    
    /**
     * Check if element is a split gateway (more outgoing than incoming)
     */
    isSplitGateway(elementId) {
        const typeConfig = ELEMENT_TYPES[this.elements.find(el => el.id === elementId)?.type];
        if (!typeConfig?.isGateway) return false;
        return this.getOutgoingFlows(elementId).length > 1;
    }
    
    /**
     * Check if element is a join gateway (more incoming than outgoing)
     */
    isJoinGateway(elementId) {
        const typeConfig = ELEMENT_TYPES[this.elements.find(el => el.id === elementId)?.type];
        if (!typeConfig?.isGateway) return false;
        return this.getIncomingFlows(elementId).length > 1;
    }
    
    // =========================================================================
    // NESTING DEPTH CALCULATION (Signavio methodology)
    // =========================================================================
    // CFC is multiplied by nesting level - deeper nested decisions are harder
    // to understand and more error-prone
    // =========================================================================
    
    /**
     * Calculate nesting depth for all gateways
     * Returns map of elementId -> nesting level (1 = top level)
     * 
     * Algorithm: BFS from start events, tracking open splits
     * When we enter a split, increment depth
     * When we reach matching join, decrement depth
     */
    calculateNestingDepths() {
        const nestingDepths = {};
        const visited = new Set();
        const openSplits = []; // Stack of open split gateways
        
        // Find start events
        const startEvents = this.elements.filter(el => 
            el.type === 'StartEvent' || el.type === 'TimerStartEvent' || el.type === 'MessageStartEvent'
        );
        
        if (startEvents.length === 0) {
            // No start event - assign depth 1 to all gateways
            this.elements.forEach(el => {
                const typeConfig = ELEMENT_TYPES[el.type];
                if (typeConfig?.isGateway) {
                    nestingDepths[el.id] = 1;
                }
            });
            return nestingDepths;
        }
        
        // BFS traversal
        const queue = startEvents.map(el => ({ elementId: el.id, depth: 0, openSplits: [] }));
        
        while (queue.length > 0) {
            const { elementId, depth, openSplits: currentOpenSplits } = queue.shift();
            
            if (visited.has(elementId)) continue;
            visited.add(elementId);
            
            const element = this.elements.find(el => el.id === elementId);
            if (!element) continue;
            
            const typeConfig = ELEMENT_TYPES[element.type];
            let newDepth = depth;
            let newOpenSplits = [...currentOpenSplits];
            
            if (typeConfig?.isGateway) {
                const isSplit = this.isSplitGateway(elementId);
                const isJoin = this.isJoinGateway(elementId);
                
                if (isSplit && !isJoin) {
                    // Pure split - increase depth
                    newDepth = depth + 1;
                    newOpenSplits.push({ id: elementId, type: typeConfig.cfcType });
                    nestingDepths[elementId] = newDepth;
                } else if (isJoin && !isSplit) {
                    // Pure join - try to match with open split
                    const matchIndex = newOpenSplits.findLastIndex(s => s.type === typeConfig.cfcType);
                    if (matchIndex >= 0) {
                        newOpenSplits.splice(matchIndex, 1);
                        newDepth = Math.max(0, depth - 1);
                    }
                    nestingDepths[elementId] = depth; // Join is at the depth before closing
                } else if (isSplit && isJoin) {
                    // Mixed gateway (both split and join)
                    nestingDepths[elementId] = depth + 1;
                    newDepth = depth + 1;
                } else {
                    // Gateway with single in/out
                    nestingDepths[elementId] = Math.max(1, depth);
                }
            }
            
            // Queue successors
            const outgoing = this.getOutgoingFlows(elementId);
            outgoing.forEach(conn => {
                if (!visited.has(conn.targetId)) {
                    queue.push({ 
                        elementId: conn.targetId, 
                        depth: newDepth, 
                        openSplits: newOpenSplits 
                    });
                }
            });
        }
        
        // Ensure all gateways have at least depth 1
        this.elements.forEach(el => {
            const typeConfig = ELEMENT_TYPES[el.type];
            if (typeConfig?.isGateway && !nestingDepths[el.id]) {
                nestingDepths[el.id] = 1;
            }
        });
        
        return nestingDepths;
    }
    
    // =========================================================================
    // STRUCTUREDNESS ANALYSIS (7PMG G4)
    // =========================================================================
    // "Model as structured as possible" - every split should have a matching
    // join of the same type. Unstructured models are more error-prone.
    // =========================================================================
    
    /**
     * Analyze process structuredness
     * Returns: { score: 0-100, matchedPairs: [], unmatchedSplits: [], unmatchedJoins: [], typeMismatches: [] }
     */
    analyzeStructuredness() {
        const splits = { XOR: [], AND: [], OR: [] };
        const joins = { XOR: [], AND: [], OR: [] };
        const issues = [];
        
        // Categorize gateways
        this.elements.forEach(el => {
            const typeConfig = ELEMENT_TYPES[el.type];
            if (!typeConfig?.isGateway || !typeConfig.cfcType) return;
            
            const cfcType = typeConfig.cfcType;
            const isSplit = this.isSplitGateway(el.id);
            const isJoin = this.isJoinGateway(el.id);
            
            if (isSplit) splits[cfcType]?.push(el);
            if (isJoin) joins[cfcType]?.push(el);
        });
        
        // Count matches and mismatches
        let matchedPairs = 0;
        let totalSplits = 0;
        const unmatchedSplits = [];
        const unmatchedJoins = [];
        
        ['XOR', 'AND', 'OR'].forEach(type => {
            const splitCount = splits[type].length;
            const joinCount = joins[type].length;
            totalSplits += splitCount;
            
            const matched = Math.min(splitCount, joinCount);
            matchedPairs += matched;
            
            // Track unmatched
            if (splitCount > joinCount) {
                const excess = splitCount - joinCount;
                for (let i = 0; i < excess; i++) {
                    unmatchedSplits.push({ 
                        element: splits[type][joinCount + i], 
                        type,
                        message: `${type} split without matching ${type} join`
                    });
                }
            } else if (joinCount > splitCount) {
                const excess = joinCount - splitCount;
                for (let i = 0; i < excess; i++) {
                    unmatchedJoins.push({ 
                        element: joins[type][splitCount + i], 
                        type,
                        message: `${type} join without matching ${type} split`
                    });
                }
            }
        });
        
        // Check for type mismatches (e.g., XOR split followed by AND join)
        // This is a simplified check - full analysis would require path tracing
        const typeMismatches = [];
        const totalSplitCount = splits.XOR.length + splits.AND.length + splits.OR.length;
        const totalJoinCount = joins.XOR.length + joins.AND.length + joins.OR.length;
        
        if (totalSplitCount !== totalJoinCount) {
            typeMismatches.push({
                message: `Unbalanced gateways: ${totalSplitCount} splits vs ${totalJoinCount} joins`,
                severity: 'medium'
            });
        }
        
        // Calculate structuredness score
        // 100% = all splits have matching joins of same type
        // Deduct points for unmatched and mismatched gateways
        let score = 100;
        if (totalSplits > 0) {
            score = Math.round((matchedPairs / totalSplits) * 100);
        }
        
        // Additional penalty for type mismatches
        score = Math.max(0, score - (typeMismatches.length * 10));
        
        return {
            score,
            matchedPairs,
            totalSplits,
            totalJoins: joins.XOR.length + joins.AND.length + joins.OR.length,
            unmatchedSplits,
            unmatchedJoins,
            typeMismatches,
            splits,
            joins
        };
    }
    
    // =========================================================================
    // HANDOVER COMPLEXITY (Signavio methodology)
    // =========================================================================
    // Tracks role/lane transitions between activities
    // New role = 1.5 points, returning role = 1.0 points
    // =========================================================================
    
    /**
     * Calculate handover complexity based on role transitions
     * Uses element.assignedRole or element.lane property
     */
    calculateHandoverComplexity() {
        let handoverScore = 0;
        const seenRoles = new Set();
        const transitions = [];
        
        // Build adjacency for activities (tasks only, not gateways/events)
        const activities = this.elements.filter(el => 
            el.type.includes('Task') || el.type === 'SubProcess' || el.type === 'CallActivity'
        );
        
        // For each connection between activities, check role change
        this.connections.forEach(conn => {
            const source = this.elements.find(el => el.id === conn.sourceId);
            const target = this.elements.find(el => el.id === conn.targetId);
            
            if (!source || !target) return;
            
            // Get roles (use assignedRole, lane, or 'default')
            const sourceRole = source.assignedRole || source.lane || 'default';
            const targetRole = target.assignedRole || target.lane || 'default';
            
            // Skip if both are default (no role info)
            if (sourceRole === 'default' && targetRole === 'default') return;
            
            // Check for handover
            if (sourceRole !== targetRole && targetRole !== 'default') {
                if (!seenRoles.has(targetRole)) {
                    // New role - 1.5 points
                    handoverScore += 1.5;
                    seenRoles.add(targetRole);
                    transitions.push({
                        from: sourceRole,
                        to: targetRole,
                        type: 'new',
                        points: 1.5
                    });
                } else {
                    // Returning to known role - 1.0 points
                    handoverScore += 1.0;
                    transitions.push({
                        from: sourceRole,
                        to: targetRole,
                        type: 'return',
                        points: 1.0
                    });
                }
            }
            
            // Track source role
            if (sourceRole !== 'default') {
                seenRoles.add(sourceRole);
            }
        });
        
        // Normalize to 0-10 scale (Signavio: 1.5 = min, 10 = max)
        // If base score <= 1.5: normalized = 0
        // If base score >= 10: normalized = 10
        let normalizedScore = 0;
        if (handoverScore > 1.5) {
            normalizedScore = Math.min(10, ((handoverScore - 1.5) / 8.5) * 10);
        }
        
        return {
            baseScore: handoverScore,
            normalizedScore: Math.round(normalizedScore * 10) / 10,
            uniqueRoles: seenRoles.size,
            transitions,
            hasRoleData: seenRoles.size > 0 && !seenRoles.has('default')
        };
    }
    
    // =========================================================================
    // ENHANCED NAMING QUALITY (7PMG G6)
    // =========================================================================
    // "Use verb-object activity labels"
    // Good: "Send Letter", "Process Application", "Review Document"
    // Bad: "Letter Sending", "Application Processing", "Document Review"
    // =========================================================================
    
    /**
     * Common action verbs for BPMN activities (verb-object style)
     */
    static ACTION_VERBS = [
        // Communication
        'send', 'receive', 'notify', 'inform', 'communicate', 'email', 'call',
        // Processing
        'process', 'handle', 'manage', 'execute', 'perform', 'complete', 'finish',
        // Review/Approval
        'review', 'approve', 'reject', 'validate', 'verify', 'check', 'confirm', 'assess',
        // CRUD Operations
        'create', 'read', 'update', 'delete', 'add', 'remove', 'modify', 'edit',
        // Data Operations
        'calculate', 'compute', 'analyze', 'evaluate', 'determine', 'generate',
        // Document Operations
        'prepare', 'draft', 'write', 'sign', 'submit', 'file', 'archive', 'store',
        // Assignment
        'assign', 'allocate', 'delegate', 'schedule', 'plan', 'prioritize',
        // Retrieval
        'get', 'fetch', 'retrieve', 'obtain', 'request', 'order', 'collect',
        // Decision
        'decide', 'select', 'choose', 'pick', 'resolve',
        // Start/End
        'start', 'begin', 'initiate', 'end', 'close', 'terminate', 'cancel',
        // Transformation
        'convert', 'transform', 'translate', 'format', 'export', 'import',
        // Monitoring
        'monitor', 'track', 'log', 'record', 'register', 'report'
    ];
    
    /**
     * Default/generic names that should be replaced
     */
    static DEFAULT_NAMES = [
        'start', 'end', 'task', 'gateway', 'parallel', 'inclusive', 'exclusive',
        'event', 'service task', 'script task', 'manual task', 'user task',
        'sub-process', 'subprocess', 'activity', 'action', 'step', 'process',
        'business rule task', 'send task', 'receive task', 'call activity'
    ];
    
    /**
     * Action-noun suffixes (indicate wrong style)
     */
    static ACTION_NOUN_SUFFIXES = [
        'ing', 'tion', 'sion', 'ment', 'ance', 'ence', 'ness', 'ity', 'al'
    ];
    
    /**
     * Analyze naming quality for all activities
     * Returns detailed scoring per element and overall score
     */
    analyzeNamingQuality() {
        const results = [];
        let totalScore = 0;
        let analyzedCount = 0;
        
        // Only analyze activities (tasks, subprocesses), not events/gateways
        const activities = this.elements.filter(el => 
            el.type.includes('Task') || el.type === 'SubProcess' || el.type === 'CallActivity'
        );
        
        activities.forEach(el => {
            const analysis = this.analyzeLabel(el.name || '', el.type);
            results.push({
                elementId: el.id,
                elementType: el.type,
                label: el.name || '',
                ...analysis
            });
            totalScore += analysis.score;
            analyzedCount++;
        });
        
        // Calculate overall naming quality percentage
        const overallScore = analyzedCount > 0 
            ? Math.round((totalScore / analyzedCount) * 100) 
            : 100;
        
        // Categorize issues
        const issues = results.filter(r => r.score < 0.7).map(r => ({
            elementId: r.elementId,
            label: r.label,
            issue: r.issues.join(', '),
            suggestion: r.suggestion
        }));
        
        return {
            overallScore,
            analyzedCount,
            goodLabels: results.filter(r => r.score >= 0.8).length,
            acceptableLabels: results.filter(r => r.score >= 0.5 && r.score < 0.8).length,
            poorLabels: results.filter(r => r.score < 0.5).length,
            details: results,
            issues
        };
    }
    
    /**
     * Wrap label text to fit within element width
     * Returns array of lines that fit within the given width
     * 
     * @param {String} text - The label text to wrap
     * @param {Number} maxWidth - Maximum width in pixels
     * @param {Boolean} isSmallElement - If true (circle/diamond), use shorter lines
     * @returns {Array<String>} Array of text lines
     */
    wrapLabelText(text, maxWidth, isSmallElement = false) {
        if (!text) return [''];
        
        // For small elements (circles, diamonds), don't wrap - just return as-is
        // These labels appear BELOW the element, so they can be wider
        if (isSmallElement) {
            // Allow up to ~20 characters per line for external labels
            const externalCharsPerLine = 25;
            if (text.length <= externalCharsPerLine) {
                return [text];
            }
            
            // Split long text for external labels
            const words = text.split(/[\s_]+/);
            const lines = [];
            let currentLine = '';
            
            words.forEach(word => {
                // Handle CamelCase
                const splitWords = word.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
                
                splitWords.forEach(w => {
                    if (currentLine.length === 0) {
                        currentLine = w;
                    } else if ((currentLine + ' ' + w).length <= externalCharsPerLine) {
                        currentLine += ' ' + w;
                    } else {
                        lines.push(currentLine);
                        currentLine = w;
                    }
                });
            });
            
            if (currentLine.length > 0) {
                lines.push(currentLine);
            }
            
            // Limit to 2 lines for external labels
            if (lines.length > 2) {
                lines.length = 2;
                lines[1] = lines[1].substring(0, externalCharsPerLine - 3) + '...';
            }
            
            return lines.length > 0 ? lines : [''];
        }
        
        // For tasks/rectangles - internal labels need to fit within element width
        // Approximate characters per line based on ~7px per character average
        const charsPerLine = Math.floor((maxWidth - 20) / 7);
        
        // If text fits, return as single line
        if (text.length <= charsPerLine) {
            return [text];
        }
        
        // Split into words
        const words = text.split(/[\s_]+/);  // Split on spaces and underscores
        const lines = [];
        let currentLine = '';
        
        words.forEach(word => {
            // Handle CamelCase by splitting
            const splitWords = word.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
            
            splitWords.forEach(w => {
                if (currentLine.length === 0) {
                    currentLine = w;
                } else if ((currentLine + ' ' + w).length <= charsPerLine) {
                    currentLine += ' ' + w;
                } else {
                    lines.push(currentLine);
                    currentLine = w;
                }
            });
        });
        
        // Don't forget the last line
        if (currentLine.length > 0) {
            lines.push(currentLine);
        }
        
        // Limit to 3 lines max, truncate with ellipsis if needed
        if (lines.length > 3) {
            lines.length = 3;
            if (lines[2].length > charsPerLine - 3) {
                lines[2] = lines[2].substring(0, charsPerLine - 3) + '...';
            } else {
                lines[2] += '...';
            }
        }
        
        return lines.length > 0 ? lines : [''];
    }
    
    /**
     * Analyze a single label for naming quality
     * Returns: { score: 0-1, issues: [], suggestion: string }
     */
    analyzeLabel(label, elementType) {
        const issues = [];
        let score = 1.0;
        let suggestion = '';
        
        // Normalize label for analysis
        const normalizedLabel = label.trim().toLowerCase();
        const words = label.trim().split(/\s+/);
        const firstWord = words[0]?.toLowerCase() || '';
        
        // Check 1: Empty or missing label
        if (!label || label.trim() === '') {
            return {
                score: 0,
                issues: ['Missing label'],
                suggestion: 'Add a descriptive verb-object label',
                isDefault: true,
                isVerbObject: false,
                isActionNoun: false
            };
        }
        
        // Check 2: Default/generic name
        const isDefault = ProcessCanvas.DEFAULT_NAMES.some(d => 
            normalizedLabel === d || normalizedLabel === d.replace(/\s+/g, '')
        );
        if (isDefault) {
            score -= 0.5;
            issues.push('Generic/default name');
            suggestion = `Replace with specific action like "Process ${elementType.replace('Task', '').trim() || 'Request'}"`;
        }
        
        // Check 3: Starts with action verb (good - verb-object style)
        const startsWithVerb = ProcessCanvas.ACTION_VERBS.some(v => 
            firstWord === v || firstWord === v + 's' || firstWord === v + 'es'
        );
        
        // Check 4: Action-noun style (bad - e.g., "Letter Sending")
        const lastWord = words[words.length - 1]?.toLowerCase() || '';
        const isActionNoun = ProcessCanvas.ACTION_NOUN_SUFFIXES.some(suffix => 
            lastWord.endsWith(suffix) && lastWord.length > suffix.length + 2
        );
        
        if (startsWithVerb) {
            // Good - verb-object style
            if (words.length >= 2) {
                // Perfect - verb + object
                // No deduction
            } else {
                // Verb only, missing object
                score -= 0.2;
                issues.push('Missing object (what is being done?)');
                suggestion = `Add object: "${label} [something]"`;
            }
        } else if (isActionNoun) {
            // Bad - action-noun style
            score -= 0.3;
            issues.push('Action-noun style (should be verb-object)');
            
            // Suggest conversion
            const actionNounToVerb = {
                'sending': 'Send', 'receiving': 'Receive', 'processing': 'Process',
                'reviewing': 'Review', 'approving': 'Approve', 'creating': 'Create',
                'updating': 'Update', 'deleting': 'Delete', 'checking': 'Check',
                'validation': 'Validate', 'verification': 'Verify', 'calculation': 'Calculate',
                'notification': 'Notify', 'submission': 'Submit', 'completion': 'Complete',
                'assignment': 'Assign', 'management': 'Manage', 'preparation': 'Prepare'
            };
            
            const conversion = Object.entries(actionNounToVerb).find(([noun]) => 
                lastWord.includes(noun.slice(0, -3)) || lastWord === noun
            );
            if (conversion) {
                const otherWords = words.slice(0, -1).join(' ');
                suggestion = `Try: "${conversion[1]} ${otherWords}"`;
            } else {
                suggestion = 'Restructure to verb-object format';
            }
        } else if (words.length === 1) {
            // Single word, not a verb
            score -= 0.3;
            issues.push('Single word label - add verb and context');
            suggestion = `Try: "Process ${label}" or "Review ${label}"`;
        } else if (!startsWithVerb && words.length >= 2) {
            // Multiple words but doesn't start with verb
            score -= 0.2;
            issues.push('Does not start with action verb');
            suggestion = `Try starting with: Send, Process, Review, Create, Update, Check...`;
        }
        
        // Check 5: Too short (less than 2 words for tasks)
        if (words.length < 2 && !isDefault) {
            score -= 0.1;
            if (!issues.includes('Single word label - add verb and context')) {
                issues.push('Label too brief');
            }
        }
        
        // Check 6: Too long (more than 6 words)
        if (words.length > 6) {
            score -= 0.1;
            issues.push('Label too verbose (>6 words)');
            suggestion = suggestion || 'Consider shortening the label';
        }
        
        // Check 7: Contains abbreviations (unless common ones)
        const commonAbbreviations = ['id', 'api', 'url', 'pdf', 'crm', 'erp', 'hr', 'it', 'kpi'];
        const hasUncommonAbbreviation = words.some(w => 
            w.length <= 3 && 
            w === w.toUpperCase() && 
            !commonAbbreviations.includes(w.toLowerCase())
        );
        if (hasUncommonAbbreviation) {
            score -= 0.1;
            issues.push('Contains abbreviations - spell out for clarity');
        }
        
        // Ensure score is between 0 and 1
        score = Math.max(0, Math.min(1, score));
        
        return {
            score,
            issues,
            suggestion,
            isDefault,
            isVerbObject: startsWithVerb && words.length >= 2,
            isActionNoun,
            wordCount: words.length
        };
    }
    
    // =========================================================================
    // MAIN SCORING METHOD - Comprehensive Academic Implementation
    // =========================================================================
    
    @api
    calculateProcessScore() {
        // Initialize counters
        let totalCFC = 0;
        let weightedCFC = 0; // CFC with nesting depth multiplier
        let cfcXOR = 0;
        let cfcOR = 0;
        let cfcAND = 0;
        let noajs = 0; // Number of Activities, Joins, and Splits
        let noa = 0;   // Number of Activities only
        let orGatewayCount = 0;
        let gatewayCount = 0;
        let startEventCount = 0;
        let endEventCount = 0;
        const issues = [];
        const gatewayDetails = [];
        
        // Calculate nesting depths for all gateways
        const nestingDepths = this.calculateNestingDepths();
        
        // Analyze each element
        this.elements.forEach(el => {
            const typeConfig = ELEMENT_TYPES[el.type];
            if (!typeConfig) return;
            
            // Count NOAJS (exclude annotations, groups, data objects)
            if (!['TextAnnotation', 'Group', 'DataObject', 'DataStore'].includes(el.type)) {
                noajs++;
            }
            
            // Count activities (NOA)
            if (el.type.includes('Task') || el.type === 'SubProcess' || el.type === 'CallActivity') {
                noa++;
            }
            
            // Count events
            if (el.type.includes('StartEvent')) startEventCount++;
            if (el.type === 'EndEvent') endEventCount++;
            
            // Analyze gateways
            if (typeConfig.isGateway && typeConfig.cfcFormula) {
                gatewayCount++;
                const outgoing = this.getOutgoingFlows(el.id).length;
                const incoming = this.getIncomingFlows(el.id).length;
                const nestingLevel = nestingDepths[el.id] || 1;
                
                // Only split gateways contribute to CFC
                if (outgoing > 1) {
                    const baseCfc = typeConfig.cfcFormula(outgoing);
                    const nestedCfc = baseCfc * nestingLevel; // Signavio methodology
                    
                    totalCFC += baseCfc;
                    weightedCFC += nestedCfc;
                    
                    gatewayDetails.push({
                        elementId: el.id,
                        name: el.name,
                        type: typeConfig.cfcType,
                        fanout: outgoing,
                        baseCfc,
                        nestingLevel,
                        weightedCfc: nestedCfc
                    });
                    
                    switch (typeConfig.cfcType) {
                        case 'XOR': 
                            cfcXOR += baseCfc; 
                            break;
                        case 'OR':
                            cfcOR += baseCfc;
                            orGatewayCount++;
                            // Warning for OR gateways with high fan-out
                            if (outgoing >= 3) {
                                issues.push({
                                    type: 'warning',
                                    elementId: el.id,
                                    elementName: el.name,
                                    message: `OR gateway "${el.name || 'Unnamed'}" with ${outgoing} paths has CFC of ${baseCfc} (exponential!)`,
                                    severity: 'high',
                                    guideline: '7PMG G5'
                                });
                            }
                            break;
                        case 'AND': 
                            cfcAND += baseCfc; 
                            break;
                        default: 
                            break;
                    }
                    
                    // Warning for deeply nested gateways
                    if (nestingLevel >= 3) {
                        issues.push({
                            type: 'warning',
                            elementId: el.id,
                            elementName: el.name,
                            message: `Gateway "${el.name || 'Unnamed'}" is nested ${nestingLevel} levels deep (complexity multiplier: ${nestingLevel}x)`,
                            severity: 'medium',
                            guideline: '7PMG G4'
                        });
                    }
                }
            }
        });
        
        // Analyze structuredness (7PMG G4)
        const structuredness = this.analyzeStructuredness();
        
        // Add structuredness issues
        structuredness.unmatchedSplits.forEach(item => {
            issues.push({
                type: 'warning',
                elementId: item.element.id,
                elementName: item.element.name,
                message: item.message,
                severity: 'medium',
                guideline: '7PMG G4'
            });
        });
        
        structuredness.unmatchedJoins.forEach(item => {
            issues.push({
                type: 'warning',
                elementId: item.element.id,
                elementName: item.element.name,
                message: item.message,
                severity: 'medium',
                guideline: '7PMG G4'
            });
        });
        
        // Analyze handover complexity
        const handoverComplexity = this.calculateHandoverComplexity();
        
        // Analyze naming quality (7PMG G6)
        const namingQuality = this.analyzeNamingQuality();
        
        // Add naming issues
        namingQuality.issues.forEach(item => {
            issues.push({
                type: 'info',
                elementId: item.elementId,
                message: `Label "${item.label}": ${item.issue}`,
                suggestion: item.suggestion,
                severity: 'low',
                guideline: '7PMG G6'
            });
        });
        
        // =====================================================================
        // ISSUE GENERATION (based on thresholds)
        // =====================================================================
        
        // 7PMG G7: Model size threshold
        if (noajs > 50) {
            issues.push({
                type: 'error',
                message: `Model has ${noajs} elements (>50). Error probability exceeds 50%. Consider decomposing.`,
                severity: 'critical',
                guideline: '7PMG G7'
            });
        } else if (noajs > 33) {
            issues.push({
                type: 'warning',
                message: `Model has ${noajs} elements - approaching high complexity threshold (33)`,
                severity: 'medium',
                guideline: '7PMG G7'
            });
        }
        
        // 7PMG G5: OR gateway count
        if (orGatewayCount > 2) {
            issues.push({
                type: 'warning',
                message: `Model has ${orGatewayCount} OR gateways. Consider replacing with XOR or AND.`,
                severity: 'medium',
                guideline: '7PMG G5'
            });
        }
        
        // CFC threshold
        if (totalCFC > 9) {
            issues.push({
                type: 'warning',
                message: `Control-Flow Complexity (CFC) of ${totalCFC} exceeds threshold (9)`,
                severity: 'high',
                guideline: 'Cardoso CFC'
            });
        }
        
        // Weighted CFC threshold (with nesting)
        if (weightedCFC > 15) {
            issues.push({
                type: 'warning',
                message: `Weighted CFC (with nesting) of ${weightedCFC} indicates deeply nested complexity`,
                severity: 'high',
                guideline: 'Signavio Flow'
            });
        }
        
        // 7PMG G3: Multiple start/end events
        if (startEventCount > 1) {
            issues.push({
                type: 'warning',
                message: `Model has ${startEventCount} start events. Consider using single entry point.`,
                severity: 'low',
                guideline: '7PMG G3'
            });
        }
        if (endEventCount > 1) {
            issues.push({
                type: 'info',
                message: `Model has ${endEventCount} end events. Consider if single exit point is feasible.`,
                severity: 'low',
                guideline: '7PMG G3'
            });
        }
        
        // Structuredness score
        if (structuredness.score < 70) {
            issues.push({
                type: 'warning',
                message: `Model structuredness is ${structuredness.score}%. Consider matching splits with joins.`,
                severity: 'medium',
                guideline: '7PMG G4'
            });
        }
        
        // =====================================================================
        // DIMENSION SCORES CALCULATION
        // =====================================================================
        
        const dimensions = this.calculateDimensionScores({
            totalCFC,
            weightedCFC,
            noajs,
            noa,
            gatewayCount,
            orGatewayCount,
            structurednessScore: structuredness.score,
            handoverScore: handoverComplexity.normalizedScore,
            namingScore: namingQuality.overallScore,
            startEventCount,
            endEventCount
        });
        
        // Calculate weighted total score
        const totalScore = Math.round(
            dimensions.structural * 0.15 +
            dimensions.controlFlow * 0.25 +
            dimensions.structuredness * 0.20 +
            dimensions.naming * 0.15 +
            dimensions.modularity * 0.10 +
            dimensions.startEnd * 0.05 +
            dimensions.handover * 0.10
        );
        
        const grade = this.getGrade(totalScore);
        const gradeColors = { 
            'A': '#22C55E', 
            'B': '#84CC16', 
            'C': '#EAB308', 
            'D': '#F97316', 
            'F': '#DC2626' 
        };
        
        // Sort issues by severity
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        issues.sort((a, b) => (severityOrder[a.severity] || 4) - (severityOrder[b.severity] || 4));
        
        return {
            // Overall scores
            total: totalScore,
            grade,
            gradeColor: gradeColors[grade],
            
            // CFC metrics
            cfc: totalCFC,
            weightedCfc: weightedCFC,
            cfcBreakdown: { xor: cfcXOR, or: cfcOR, and: cfcAND },
            
            // Element counts
            noajs,
            noa,
            gatewayCount,
            startEventCount,
            endEventCount,
            
            // Dimension scores
            dimensions,
            
            // Detailed analysis
            nestingDepths,
            gatewayDetails,
            structuredness,
            handoverComplexity,
            namingQuality,
            
            // Issues and warnings
            issues,
            
            // Thresholds for UI
            thresholds: {
                cfc: totalCFC <= 3 ? 'low' : totalCFC <= 9 ? 'moderate' : 'high',
                weightedCfc: weightedCFC <= 5 ? 'low' : weightedCFC <= 15 ? 'moderate' : 'high',
                noajs: noajs <= 17 ? 'low' : noajs <= 33 ? 'moderate' : 'high',
                noa: noa <= 12 ? 'low' : noa <= 26 ? 'moderate' : 'high',
                structuredness: structuredness.score >= 80 ? 'low' : structuredness.score >= 50 ? 'moderate' : 'high',
                naming: namingQuality.overallScore >= 80 ? 'low' : namingQuality.overallScore >= 50 ? 'moderate' : 'high'
            },
            
            // Academic compliance flags
            compliance: {
                cardosoCFC: true,
                mendling7PMG: true,
                signavioNesting: true,
                signavioHandover: handoverComplexity.hasRoleData
            }
        };
    }
    
    /**
     * Calculate dimension scores based on comprehensive metrics
     */
    calculateDimensionScores({ 
        totalCFC, 
        weightedCFC,
        noajs, 
        noa, 
        gatewayCount, 
        orGatewayCount,
        structurednessScore,
        handoverScore,
        namingScore,
        startEventCount,
        endEventCount
    }) {
        // Structural (7PMG G1): Element count
        // 0-17: 100%, 17-33: linear decrease to 60%, 33-50: decrease to 20%, >50: 0-20%
        const structural = Math.max(0, Math.min(100, 
            noajs <= 17 ? 100 :
            noajs <= 33 ? 100 - ((noajs - 17) / 16) * 40 :
            noajs <= 50 ? 60 - ((noajs - 33) / 17) * 40 :
            20 - Math.min(20, (noajs - 50) * 2)
        ));
        
        // Control Flow (Cardoso CFC + Signavio nesting)
        // Uses weighted CFC which includes nesting depth multiplier
        // 0-5: 100%, 5-15: linear decrease to 50%, 15-30: decrease to 0%
        const controlFlow = Math.max(0, Math.min(100,
            weightedCFC <= 5 ? 100 :
            weightedCFC <= 15 ? 100 - ((weightedCFC - 5) / 10) * 50 :
            weightedCFC <= 30 ? 50 - ((weightedCFC - 15) / 15) * 50 :
            0
        ));
        
        // Structuredness (7PMG G4): Split/join matching
        // Directly use the structuredness score (0-100)
        const structuredness = structurednessScore;
        
        // Naming (7PMG G6): Verb-object labels
        // Directly use the naming quality score (0-100)
        const naming = namingScore;
        
        // Modularity (7PMG G7): Model decomposition
        // Penalize models that are too large for single view
        const modularity = Math.max(0, Math.min(100,
            noajs <= 30 ? 100 :
            noajs <= 50 ? 100 - ((noajs - 30) / 20) * 50 :
            50 - Math.min(50, (noajs - 50) * 2)
        ));
        
        // Start/End (7PMG G3): Single entry/exit
        // 100% for single start and end, deduct for multiples
        let startEnd = 100;
        if (startEventCount > 1) startEnd -= (startEventCount - 1) * 15;
        if (endEventCount > 2) startEnd -= (endEventCount - 2) * 10;
        startEnd = Math.max(0, startEnd);
        
        // Handover (Signavio): Role transitions
        // Inverse of handover score (lower handovers = better)
        const handover = Math.max(0, 100 - (handoverScore * 10));
        
        return {
            structural: Math.round(structural),
            controlFlow: Math.round(controlFlow),
            structuredness: Math.round(structuredness),
            naming: Math.round(naming),
            modularity: Math.round(modularity),
            startEnd: Math.round(startEnd),
            handover: Math.round(handover)
        };
    }
    
    /**
     * Convert score to letter grade
     */
    getGrade(score) {
        if (score >= 90) return 'A';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 60) return 'D';
        return 'F';
    }
    
    /**
     * Get CFC badge color for visual indicators
     * Traffic light: Yellow (low), Orange (medium), Red (high)
     */
    getCfcBadgeColor(cfc) {
        if (cfc >= 7) return '#DC2626';  // Red - High
        if (cfc >= 4) return '#F97316';  // Orange - Medium
        if (cfc >= 1) return '#EAB308';  // Yellow - Low
        return null;
    }
    
    // =========================================================================
    // TRACKED STATE
    // =========================================================================
    
    @track elements = [];
    @track connections = [];
    @track baseViewBox = { x: 0, y: 0, width: 1200, height: 800 };
    @track zoom = 1;
    @track selectedElementId = null;
    @track selectedConnectionId = null;
    @track isConnecting = false;
    @track connectionStartId = null;
    @track connectionStartSide = null;
    @track connectionStartPoint = null;
    @track tempConnectionEnd = null;
    @track isPanning = false;
    @track isDragging = false;
    @track dragOffset = { x: 0, y: 0 };
    @track panStart = { x: 0, y: 0 };
    @track panViewBoxStart = { x: 0, y: 0 };
    
    // Imported flow metadata
    @track importedFlowName = '';
    @track importedFlowLabel = '';
    @track importedFlowType = '';
    
    // Resize state for Pool/Lane
    @track isResizing = false;
    @track resizeHandle = null; // 'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'
    @track resizeStartPoint = null;
    @track resizeStartDimensions = null;
    
    // =========================================================================
    // LIFECYCLE
    // =========================================================================
    
    renderedCallback() {
        if (!this._initialized) {
            this._initialized = true;
            this.initializeCanvas();
        }
    }
    
    initializeCanvas() {
        const marker = this.template.querySelector('#arrowhead');
        if (marker) {
            marker.setAttribute('refX', '9');
            marker.setAttribute('refY', '3.5');
        }
        
        const container = this.template.querySelector('.canvas-container');
        if (container) {
            container.addEventListener('keydown', this.handleKeyDown.bind(this));
            container.addEventListener('keyup', this.handleKeyUp.bind(this));
        }
    }
    
    // =========================================================================
    // COMPUTED PROPERTIES - ZOOM
    // =========================================================================
    
    get viewBoxString() {
        const scaledWidth = this.baseViewBox.width / this.zoom;
        const scaledHeight = this.baseViewBox.height / this.zoom;
        const centerX = this.baseViewBox.x + this.baseViewBox.width / 2;
        const centerY = this.baseViewBox.y + this.baseViewBox.height / 2;
        const viewBoxX = centerX - scaledWidth / 2;
        const viewBoxY = centerY - scaledHeight / 2;
        return `${viewBoxX} ${viewBoxY} ${scaledWidth} ${scaledHeight}`;
    }
    
    get zoomPercentage() {
        return Math.round(this.zoom * 100);
    }
    
    // =========================================================================
    // COMPUTED PROPERTIES - TEMPORARY CONNECTION LINE
    // =========================================================================
    
    get tempLineX1() {
        return this.connectionStartPoint ? this.connectionStartPoint.x : 0;
    }
    
    get tempLineY1() {
        return this.connectionStartPoint ? this.connectionStartPoint.y : 0;
    }
    
    get tempLineX2() {
        return this.tempConnectionEnd ? this.tempConnectionEnd.x : this.tempLineX1;
    }
    
    get tempLineY2() {
        return this.tempConnectionEnd ? this.tempConnectionEnd.y : this.tempLineY1;
    }
    
    // =========================================================================
    // COMPUTED PROPERTIES - IMPORTED FLOW INFO
    // =========================================================================
    
    get hasImportedFlow() {
        return !!this.importedFlowName;
    }
    
    get importedFlowDisplayName() {
        if (!this.importedFlowName) return '';
        
        // Show label if available, otherwise show API name
        const name = this.importedFlowLabel || this.importedFlowName;
        
        // Add process type if available
        const typeLabel = this.getProcessTypeLabel(this.importedFlowType);
        
        return typeLabel ? `${name} (${typeLabel})` : name;
    }
    
    getProcessTypeLabel(processType) {
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
        return typeMap[processType] || processType || '';
    }
    
    // =========================================================================
    // COMPUTED PROPERTIES - RENDERED ELEMENTS
    // =========================================================================
    
    get renderedElements() {
        return this.elements.map(el => {
            const typeConfig = ELEMENT_TYPES[el.type] || ELEMENT_TYPES.UserTask;
            const isSelected = el.id === this.selectedElementId;
            
            const centerX = el.x + el.width / 2;
            const centerY = el.y + el.height / 2;
            const radius = el.width / 2;
            const innerRadius = radius - 4;
            const isDiamond = typeConfig.shape === 'diamond';
            const isCircle = typeConfig.shape === 'circle';
            const isRect = typeConfig.shape === 'rect';
            const isPool = typeConfig.shape === 'pool';
            const isLane = typeConfig.shape === 'lane';
            const isContainer = isPool || isLane;
            
            const diamondPoints = isDiamond 
                ? `${centerX},${el.y} ${el.x + el.width},${centerY} ${centerX},${el.y + el.height} ${el.x},${centerY}`
                : '';
            
            const iconOffset = 10;
            const xIconPath = `M${centerX - iconOffset} ${centerY - iconOffset} L${centerX + iconOffset} ${centerY + iconOffset} M${centerX + iconOffset} ${centerY - iconOffset} L${centerX - iconOffset} ${centerY + iconOffset}`;
            const plusIconPath = `M${centerX} ${centerY - iconOffset} L${centerX} ${centerY + iconOffset} M${centerX - iconOffset} ${centerY} L${centerX + iconOffset} ${centerY}`;
            const circleIconRadius = 10;
            
            const labelOffset = 8;
            let labelY;
            let labelInside = false;
            
            if (isCircle) {
                labelY = el.y + el.height + labelOffset;
            } else if (isDiamond) {
                labelY = el.y + el.height + labelOffset;
            } else if (isPool || isLane) {
                // Pool/Lane labels are in the header (vertical text)
                labelY = el.y + el.height / 2;
                labelInside = true;
            } else {
                labelY = centerY;
                labelInside = true;
            }
            
            let connPointTopX, connPointTopY, connPointRightX, connPointRightY;
            let connPointBottomX, connPointBottomY, connPointLeftX, connPointLeftY;
            
            if (isCircle) {
                connPointTopX = centerX;
                connPointTopY = centerY - radius;
                connPointRightX = centerX + radius;
                connPointRightY = centerY;
                connPointBottomX = centerX;
                connPointBottomY = centerY + radius;
                connPointLeftX = centerX - radius;
                connPointLeftY = centerY;
            } else if (isDiamond) {
                connPointTopX = centerX;
                connPointTopY = el.y;
                connPointRightX = el.x + el.width;
                connPointRightY = centerY;
                connPointBottomX = centerX;
                connPointBottomY = el.y + el.height;
                connPointLeftX = el.x;
                connPointLeftY = centerY;
            } else {
                connPointTopX = centerX;
                connPointTopY = el.y;
                connPointRightX = el.x + el.width;
                connPointRightY = centerY;
                connPointBottomX = centerX;
                connPointBottomY = el.y + el.height;
                connPointLeftX = el.x;
                connPointLeftY = centerY;
            }
            
            // Compute wrapped label lines for text display
            const wrappedLabel = this.wrapLabelText(el.name || '', el.width || 120, isCircle || isDiamond);
            
            let cfcContribution = 0;
            let showComplexityBadge = false;
            let complexityBadgeColor = null;
            let complexityBadgeText = '';
            
            if (typeConfig.isGateway && typeConfig.cfcFormula) {
                const outgoing = this.getOutgoingFlows(el.id).length;
                
                if (outgoing > 1) {
                    cfcContribution = typeConfig.cfcFormula(outgoing);
                    
                    if (cfcContribution > 0) {
                        showComplexityBadge = true;
                        complexityBadgeColor = this.getCfcBadgeColor(cfcContribution);
                        complexityBadgeText = `+${cfcContribution}`;
                    }
                }
            }
            
            const badgeX = el.x + el.width - 8;
            const badgeY = el.y - 8;
            
            const selectionPoints = isDiamond
                ? `${centerX},${el.y - 4} ${el.x + el.width + 4},${centerY} ${centerX},${el.y + el.height + 4} ${el.x - 4},${centerY}`
                : '';
            
            return {
                ...typeConfig,  // Default config first
                ...el,          // Element's actual values override defaults (including resized width/height)
                centerX,
                centerY,
                radius,
                innerRadius,
                isDiamond,
                isCircle,
                isRect,
                isPool,
                isLane,
                isContainer,
                isSelected,
                diamondPoints,
                selectionPoints,
                isXIcon: typeConfig.icon === 'x',
                isPlusIcon: typeConfig.icon === 'plus',
                isCircleIcon: typeConfig.icon === 'o',
                xIconPath,
                plusIconPath,
                circleIconRadius,
                // Wrapped label properties
                wrappedLabel,
                labelLine1: wrappedLabel[0] || '',
                labelLine2: wrappedLabel[1] || '',
                labelLine3: wrappedLabel[2] || '',
                hasLine2: wrappedLabel.length > 1,
                hasLine3: wrappedLabel.length > 2,
                // Y offsets for multi-line text
                // For external labels (circles/diamonds), lines go DOWN from labelY
                // For internal labels (tasks), lines are CENTERED around labelY
                labelLine1Y: labelInside 
                    ? (wrappedLabel.length === 1 ? labelY : (labelY - (wrappedLabel.length - 1) * 7))
                    : labelY,
                labelLine2Y: labelInside
                    ? (wrappedLabel.length === 1 ? labelY : (labelY - (wrappedLabel.length - 1) * 7 + 14))
                    : (labelY + 16),  // External labels: 16px below line 1
                labelLine3Y: labelInside
                    ? (wrappedLabel.length === 1 ? labelY : (labelY - (wrappedLabel.length - 1) * 7 + 28))
                    : (labelY + 32),  // External labels: 32px below line 1
                showUserIcon: typeConfig.icon === 'user',
                showServiceIcon: typeConfig.icon === 'service',
                iconTransform: `translate(${el.x + 8}, ${el.y + 8})`,
                labelX: centerX,
                labelY,
                labelInside,
                strokeDasharray: typeConfig.dashed ? '5,3' : 'none',
                // Pool/Lane header dimensions (orientation-aware)
                headerSize: typeConfig.headerSize || 30,
                isHorizontal: el.orientation !== 'vertical',
                isVertical: el.orientation === 'vertical',
                // Header rect for horizontal: left side (width=headerSize, height=full)
                // Header rect for vertical: top side (width=full, height=headerSize)
                headerRectX: el.x,
                headerRectY: el.y,
                headerRectWidth: el.orientation === 'vertical' ? el.width : (typeConfig.headerSize || 30),
                headerRectHeight: el.orientation === 'vertical' ? (typeConfig.headerSize || 30) : el.height,
                // Pool/Lane label position
                poolLabelX: el.orientation === 'vertical' 
                    ? el.x + el.width / 2 
                    : el.x + (typeConfig.headerSize || 30) / 2,
                poolLabelY: el.orientation === 'vertical' 
                    ? el.y + (typeConfig.headerSize || 30) / 2 
                    : el.y + el.height / 2,
                poolLabelTransform: el.orientation === 'vertical' 
                    ? '' // No rotation for vertical (horizontal text at top)
                    : `rotate(-90, ${el.x + (typeConfig.headerSize || 30) / 2}, ${el.y + el.height / 2})`,
                // Resize handles (8 points around the element) - FLATTENED for LWC
                showResizeHandles: isContainer && isSelected,
                // North handle (top center)
                resizeHandleNX: centerX - 4,
                resizeHandleNY: el.y - 4,
                // South handle (bottom center)
                resizeHandleSX: centerX - 4,
                resizeHandleSY: el.y + el.height - 4,
                // East handle (right center)
                resizeHandleEX: el.x + el.width - 4,
                resizeHandleEY: centerY - 4,
                // West handle (left center)
                resizeHandleWX: el.x - 4,
                resizeHandleWY: centerY - 4,
                // Northeast handle (top right)
                resizeHandleNEX: el.x + el.width - 4,
                resizeHandleNEY: el.y - 4,
                // Northwest handle (top left)
                resizeHandleNWX: el.x - 4,
                resizeHandleNWY: el.y - 4,
                // Southeast handle (bottom right)
                resizeHandleSEX: el.x + el.width - 4,
                resizeHandleSEY: el.y + el.height - 4,
                // Southwest handle (bottom left)
                resizeHandleSWX: el.x - 4,
                resizeHandleSWY: el.y + el.height - 4,
                connPointTopX,
                connPointTopY,
                connPointRightX,
                connPointRightY,
                connPointBottomX,
                connPointBottomY,
                connPointLeftX,
                connPointLeftY,
                cssClass: `bpmn-element ${isSelected ? 'selected' : ''} ${isContainer ? 'container-element' : ''}`,
                cfcContribution,
                cfcType: typeConfig.cfcType || null,
                showComplexityBadge,
                complexityBadgeColor,
                complexityBadgeText,
                badgeX,
                badgeY,
                badgeCenterX: badgeX + 10,
                badgeCenterY: badgeY + 8,
                isHighRisk: typeConfig.isHighRisk || false,
                complexityDescription: typeConfig.complexityDescription || ''
            };
        });
    }
    
    // =========================================================================
    // COMPUTED PROPERTIES - RENDERED CONNECTIONS
    // =========================================================================
    
    get renderedConnections() {
        return this.connections.map(conn => {
            const typeConfig = CONNECTION_TYPES[conn.type] || CONNECTION_TYPES.SequenceFlow;
            const sourceEl = this.elements.find(el => el.id === conn.sourceId);
            const targetEl = this.elements.find(el => el.id === conn.targetId);
            
            if (!sourceEl || !targetEl) return null;
            
            const path = this.calculateConnectionPath(sourceEl, targetEl, conn.sourceSide, conn.targetSide);
            
            return {
                ...conn,
                ...typeConfig,
                path,
                isSelected: conn.id === this.selectedConnectionId,
                cssClass: `bpmn-connection ${conn.id === this.selectedConnectionId ? 'selected' : ''}`,
                dashArray: typeConfig.dashed ? '5,5' : 'none'
            };
        }).filter(Boolean);
    }
    
    // =========================================================================
    // CONNECTION PATH CALCULATION
    // =========================================================================
    
    calculateConnectionPath(source, target, sourceSide, targetSide) {
        // Auto-detect best connection sides based on relative positions
        const bestSides = this.determineBestConnectionSides(source, target);
        const actualSourceSide = sourceSide || bestSides.sourceSide;
        const actualTargetSide = targetSide || bestSides.targetSide;
        
        const sourcePoint = this.getConnectionPointAtSide(source, actualSourceSide);
        const targetPoint = this.getConnectionPointAtSide(target, actualTargetSide);
        
        return this.createOrthogonalPath(sourcePoint, targetPoint, actualSourceSide, actualTargetSide);
    }
    
    /**
     * Determine the best sides for connecting two elements based on their positions
     * Prefers horizontal flow (left-to-right) for typical BPMN diagrams
     */
    determineBestConnectionSides(source, target) {
        const sourceCenterX = source.x + (source.width || 120) / 2;
        const sourceCenterY = source.y + (source.height || 80) / 2;
        const targetCenterX = target.x + (target.width || 120) / 2;
        const targetCenterY = target.y + (target.height || 80) / 2;
        
        const dx = targetCenterX - sourceCenterX;
        const dy = targetCenterY - sourceCenterY;
        
        // Determine primary direction
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        
        let sourceSide, targetSide;
        
        // Primarily horizontal flow (most common in BPMN)
        if (absDx > absDy * 0.5) {
            if (dx > 0) {
                // Target is to the right
                sourceSide = 'right';
                targetSide = 'left';
            } else {
                // Target is to the left (backflow)
                sourceSide = 'left';
                targetSide = 'right';
            }
        } else {
            // Primarily vertical flow
            if (dy > 0) {
                // Target is below
                sourceSide = 'bottom';
                targetSide = 'top';
            } else {
                // Target is above
                sourceSide = 'top';
                targetSide = 'bottom';
            }
        }
        
        // Special case: if elements are very close horizontally but offset vertically
        // prefer using top/bottom exits for cleaner routing
        if (absDx < 50 && absDy > 30) {
            if (dy > 0) {
                sourceSide = 'bottom';
                targetSide = 'top';
            } else {
                sourceSide = 'top';
                targetSide = 'bottom';
            }
        }
        
        return { sourceSide, targetSide };
    }
    
    getConnectionPointAtSide(element, side) {
        const centerX = element.x + element.width / 2;
        const centerY = element.y + element.height / 2;
        const typeConfig = ELEMENT_TYPES[element.type] || ELEMENT_TYPES.UserTask;
        
        if (typeConfig.shape === 'circle') {
            const radius = element.width / 2;
            switch (side) {
                case 'top': return { x: centerX, y: centerY - radius };
                case 'right': return { x: centerX + radius, y: centerY };
                case 'bottom': return { x: centerX, y: centerY + radius };
                case 'left': return { x: centerX - radius, y: centerY };
                default: return { x: centerX + radius, y: centerY };
            }
        } else if (typeConfig.shape === 'diamond') {
            switch (side) {
                case 'top': return { x: centerX, y: element.y };
                case 'right': return { x: element.x + element.width, y: centerY };
                case 'bottom': return { x: centerX, y: element.y + element.height };
                case 'left': return { x: element.x, y: centerY };
                default: return { x: element.x + element.width, y: centerY };
            }
        } else {
            switch (side) {
                case 'top': return { x: centerX, y: element.y };
                case 'right': return { x: element.x + element.width, y: centerY };
                case 'bottom': return { x: centerX, y: element.y + element.height };
                case 'left': return { x: element.x, y: centerY };
                default: return { x: element.x + element.width, y: centerY };
            }
        }
    }
    
    /**
     * @description Creates an orthogonal (right-angle) path with rounded corners
     * Uses simple L-shaped paths when possible, only adds complexity when needed
     * 
     * ROUTING LOGIC:
     * - If exiting right and target is to the right: horizontal → corner → vertical → corner → horizontal
     * - If exiting bottom and target is below: vertical → corner → horizontal (simple L-shape)
     * - If direction conflicts (e.g., exit top but target is below): use S-shape with midpoint
     * 
     * @param {Object} from - Starting point {x, y}
     * @param {Object} to - Ending point {x, y}
     * @param {String} sourceSide - Side of source element (top/right/bottom/left)
     * @param {String} targetSide - Side of target element (top/right/bottom/left)
     * @returns {String} SVG path string
     */
    createOrthogonalPath(from, to, sourceSide, targetSide) {
        const r = 12; // Corner radius - larger for smoother curves
        let path = `M ${from.x} ${from.y}`;
        
        // Direction helpers
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const goingRight = dx > 0;
        const goingDown = dy > 0;
        const goingLeft = dx < 0;
        const goingUp = dy < 0;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        
        // If points are nearly aligned, draw straight line
        if (absDx < 5 && absDy < 5) {
            return path + ` L ${to.x} ${to.y}`;
        }
        
        // Straight horizontal line (same Y)
        if (absDy < 5) {
            return path + ` L ${to.x} ${to.y}`;
        }
        
        // Straight vertical line (same X)
        if (absDx < 5) {
            return path + ` L ${to.x} ${to.y}`;
        }
        
        // =====================================================================
        // STANDARD BPMN MANHATTAN ROUTING
        // Right-to-Left is the most common case in process flows
        // =====================================================================
        
        // CASE 1: Right to Left - standard horizontal flow with vertical offset
        // Most common in BPMN: exit right, enter left, with different Y positions
        if (sourceSide === 'right' && targetSide === 'left') {
            // Calculate midpoint X (halfway between source and target)
            const midX = from.x + (dx / 2);
            
            if (absDy < 20) {
                // Almost same level - single step down/up then across
                path += ` L ${midX - r} ${from.y}`;
                path += ` Q ${midX} ${from.y} ${midX} ${from.y + (goingDown ? r : -r)}`;
                path += ` L ${midX} ${to.y + (goingDown ? -r : r)}`;
                path += ` Q ${midX} ${to.y} ${midX + r} ${to.y}`;
                path += ` L ${to.x} ${to.y}`;
            } else {
                // Significant Y difference - clean S-curve
                path += ` L ${midX - r} ${from.y}`;
                path += ` Q ${midX} ${from.y} ${midX} ${from.y + (goingDown ? r : -r)}`;
                path += ` L ${midX} ${to.y - (goingDown ? r : -r)}`;
                path += ` Q ${midX} ${to.y} ${midX + r} ${to.y}`;
                path += ` L ${to.x} ${to.y}`;
            }
            return path;
        }
        
        // CASE 2: Left to Right - backflow (less common)
        if (sourceSide === 'left' && targetSide === 'right') {
            const midX = from.x - Math.max(30, absDx / 2);
            
            path += ` L ${midX + r} ${from.y}`;
            path += ` Q ${midX} ${from.y} ${midX} ${from.y + (goingDown ? r : -r)}`;
            path += ` L ${midX} ${to.y - (goingDown ? r : -r)}`;
            path += ` Q ${midX} ${to.y} ${midX - r} ${to.y}`;
            path += ` L ${to.x} ${to.y}`;
            return path;
        }
        
        // CASE 3: Bottom to Top - vertical flow downward
        if (sourceSide === 'bottom' && targetSide === 'top') {
            const midY = from.y + (dy / 2);
            
            if (absDx < 20) {
                // Almost same X - straight down
                path += ` L ${to.x} ${to.y}`;
            } else {
                // Need horizontal jog
                path += ` L ${from.x} ${midY - r}`;
                path += ` Q ${from.x} ${midY} ${from.x + (goingRight ? r : -r)} ${midY}`;
                path += ` L ${to.x - (goingRight ? r : -r)} ${midY}`;
                path += ` Q ${to.x} ${midY} ${to.x} ${midY + r}`;
                path += ` L ${to.x} ${to.y}`;
            }
            return path;
        }
        
        // CASE 4: Top to Bottom - vertical flow upward  
        if (sourceSide === 'top' && targetSide === 'bottom') {
            const midY = from.y + (dy / 2);
            
            if (absDx < 20) {
                path += ` L ${to.x} ${to.y}`;
            } else {
                path += ` L ${from.x} ${midY + r}`;
                path += ` Q ${from.x} ${midY} ${from.x + (goingRight ? r : -r)} ${midY}`;
                path += ` L ${to.x - (goingRight ? r : -r)} ${midY}`;
                path += ` Q ${to.x} ${midY} ${to.x} ${midY - r}`;
                path += ` L ${to.x} ${to.y}`;
            }
            return path;
        }
        
        // =====================================================================
        // FALLBACK: Generic L-shape or S-shape for other combinations
        // =====================================================================
        
        const horizontalExit = sourceSide === 'left' || sourceSide === 'right';
        const verticalExit = sourceSide === 'top' || sourceSide === 'bottom';
        
        if (horizontalExit) {
            const exitRight = sourceSide === 'right';
            let midX;
            
            if (exitRight) {
                midX = Math.max(from.x + 30, (from.x + to.x) / 2);
            } else {
                midX = Math.min(from.x - 30, (from.x + to.x) / 2);
            }
            
            const firstCornerY = goingDown ? from.y + r : from.y - r;
            const secondCornerY = goingDown ? to.y - r : to.y + r;
            
            path += ` L ${midX - (exitRight ? r : -r)} ${from.y}`;
            path += ` Q ${midX} ${from.y} ${midX} ${firstCornerY}`;
            path += ` L ${midX} ${secondCornerY}`;
            path += ` Q ${midX} ${to.y} ${midX + (goingRight ? r : -r)} ${to.y}`;
            path += ` L ${to.x} ${to.y}`;
            
        } else if (verticalExit) {
            const exitBottom = sourceSide === 'bottom';
            let midY;
            
            if (exitBottom) {
                midY = Math.max(from.y + 30, (from.y + to.y) / 2);
            } else {
                midY = Math.min(from.y - 30, (from.y + to.y) / 2);
            }
            
            const firstCornerX = goingRight ? from.x + r : from.x - r;
            const secondCornerX = goingRight ? to.x - r : to.x + r;
            
            path += ` L ${from.x} ${midY - (exitBottom ? r : -r)}`;
            path += ` Q ${from.x} ${midY} ${firstCornerX} ${midY}`;
            path += ` L ${secondCornerX} ${midY}`;
            path += ` Q ${to.x} ${midY} ${to.x} ${midY + (goingDown ? r : -r)}`;
            path += ` L ${to.x} ${to.y}`;
            
        } else {
            // Direct line fallback
            path += ` L ${to.x} ${to.y}`;
        }
        
        return path;
    }
    
    calculateBestSides(sourceEl, targetEl) {
        const sourceCenter = {
            x: sourceEl.x + sourceEl.width / 2,
            y: sourceEl.y + sourceEl.height / 2
        };
        const targetCenter = {
            x: targetEl.x + targetEl.width / 2,
            y: targetEl.y + targetEl.height / 2
        };
        
        const dx = targetCenter.x - sourceCenter.x;
        const dy = targetCenter.y - sourceCenter.y;
        
        let sourceSide, targetSide;
        
        if (Math.abs(dx) > Math.abs(dy)) {
            if (dx > 0) {
                sourceSide = 'right';
                targetSide = 'left';
            } else {
                sourceSide = 'left';
                targetSide = 'right';
            }
        } else {
            if (dy > 0) {
                sourceSide = 'bottom';
                targetSide = 'top';
            } else {
                sourceSide = 'top';
                targetSide = 'bottom';
            }
        }
        
        return { sourceSide, targetSide };
    }
    
    // =========================================================================
    // EVENT HANDLERS - ELEMENT
    // =========================================================================
    
    handleElementMouseDown(event) {
        if (this.readOnly) return;
        
        event.stopPropagation();
        const elementId = event.currentTarget.dataset.id;
        
        this.selectElement(elementId);
        
        const element = this.elements.find(el => el.id === elementId);
        if (element) {
            this.isDragging = true;
            const svgPoint = this.getSvgPoint(event);
            this.dragOffset = {
                x: svgPoint.x - element.x,
                y: svgPoint.y - element.y
            };
        }
    }
    
    handleElementDoubleClick(event) {
        event.stopPropagation();
    }
    
    handleConnectionPointMouseDown(event) {
        if (this.readOnly) return;
        
        event.stopPropagation();
        const elementId = event.currentTarget.dataset.elementid;
        const position = event.currentTarget.dataset.position;
        
        if (!this.isConnecting) {
            this.isConnecting = true;
            this.connectionStartId = elementId;
            this.connectionStartSide = position;
            
            const element = this.elements.find(el => el.id === elementId);
            if (element) {
                this.connectionStartPoint = this.getConnectionPointAtSide(element, position);
                this.tempConnectionEnd = { ...this.connectionStartPoint };
            }
        } else {
            if (elementId !== this.connectionStartId) {
                this.createConnection(
                    this.connectionStartId, 
                    elementId, 
                    this.connectionStartSide, 
                    position
                );
            }
            this.cancelConnection();
        }
    }
    
    handleConnectionClick(event) {
        event.stopPropagation();
        const connectionId = event.currentTarget.dataset.id;
        this.selectConnection(connectionId);
    }
    
    // =========================================================================
    // EVENT HANDLERS - CANVAS (FIXED PAN MODE)
    // =========================================================================
    
    handleCanvasMouseDown(event) {
        if (this.readOnly) return;
        
        // Middle mouse button always pans
        if (event.button === 1) {
            this.startPanning(event);
            event.preventDefault();
            return;
        }
        
        // Left click
        if (event.button === 0) {
            // Shift+click for panning
            if (event.shiftKey) {
                this.startPanning(event);
                event.preventDefault();
                return;
            }
            
            // Click on background - start panning AND clear selection
            if (event.target.classList.contains('canvas-background') || 
                event.target.classList.contains('canvas-svg')) {
                
                // Cancel connection if in progress
                if (this.isConnecting) {
                    this.cancelConnection();
                    return;
                }
                
                // Start panning on background drag
                this.startPanning(event);
                
                // Also clear selection
                this.clearSelection();
            }
        }
    }
    
    startPanning(event) {
        this.isPanning = true;
        this.panStart = { x: event.clientX, y: event.clientY };
        this.panViewBoxStart = { x: this.baseViewBox.x, y: this.baseViewBox.y };
        
        // Add panning class to container for cursor
        const container = this.template.querySelector('.canvas-container');
        if (container) {
            container.classList.add('panning');
        }
    }
    
    stopPanning() {
        this.isPanning = false;
        
        // Remove panning class from container
        const container = this.template.querySelector('.canvas-container');
        if (container) {
            container.classList.remove('panning');
        }
    }
    
    handleCanvasMouseMove(event) {
        // Handle resizing (priority over drag)
        if (this.isResizing) {
            this.handleResizeMove(event);
            return;
        }
        
        // Handle panning
        if (this.isPanning) {
            const dx = (event.clientX - this.panStart.x) / this.zoom;
            const dy = (event.clientY - this.panStart.y) / this.zoom;
            
            this.baseViewBox = {
                ...this.baseViewBox,
                x: this.panViewBoxStart.x - dx,
                y: this.panViewBoxStart.y - dy
            };
        } else if (this.isDragging && this.selectedElementId) {
            const svgPoint = this.getSvgPoint(event);
            const newX = Math.round((svgPoint.x - this.dragOffset.x) / 10) * 10;
            const newY = Math.round((svgPoint.y - this.dragOffset.y) / 10) * 10;
            
            const index = this.elements.findIndex(el => el.id === this.selectedElementId);
            if (index !== -1) {
                this.elements[index] = {
                    ...this.elements[index],
                    x: newX,
                    y: newY
                };
                this.elements = [...this.elements];
            }
        } else if (this.isConnecting) {
            this.tempConnectionEnd = this.getSvgPoint(event);
        }
    }
    
    handleCanvasMouseUp(event) {
        if (this.isPanning) {
            this.stopPanning();
        }
        
        if (this.isDragging) {
            this.isDragging = false;
            this.notifyCanvasChange();
        }
        
        if (this.isResizing) {
            this.isResizing = false;
            this.resizeHandle = null;
            this.notifyCanvasChange();
        }
        
        // If connecting and mouse up on empty space, cancel
        if (this.isConnecting && (event.target.classList.contains('canvas-background') || 
            event.target.classList.contains('canvas-svg'))) {
            this.cancelConnection();
        }
    }
    
    handleCanvasMouseLeave(event) {
        // Stop operations when mouse leaves canvas
        if (this.isPanning) {
            this.stopPanning();
        }
        
        if (this.isDragging) {
            this.isDragging = false;
            this.notifyCanvasChange();
        }
        
        if (this.isResizing) {
            this.isResizing = false;
            this.resizeHandle = null;
            this.notifyCanvasChange();
        }
    }
    
    // =========================================================================
    // EVENT HANDLERS - RESIZE (for Pool/Lane)
    // =========================================================================
    
    handleResizeHandleMouseDown(event) {
        if (this.readOnly) return;
        
        event.stopPropagation();
        const elementId = event.currentTarget.dataset.elementid;
        const handle = event.currentTarget.dataset.handle;
        
        const element = this.elements.find(el => el.id === elementId);
        if (!element) return;
        
        const typeConfig = ELEMENT_TYPES[element.type];
        if (!typeConfig || !typeConfig.isResizable) return;
        
        this.isResizing = true;
        this.resizeHandle = handle;
        this.resizeStartPoint = this.getSvgPoint(event);
        this.resizeStartDimensions = {
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height
        };
        this.selectElement(elementId);
    }
    
    handleResizeMove(event) {
        if (!this.isResizing || !this.selectedElementId) return;
        
        const currentPoint = this.getSvgPoint(event);
        const deltaX = currentPoint.x - this.resizeStartPoint.x;
        const deltaY = currentPoint.y - this.resizeStartPoint.y;
        
        const element = this.elements.find(el => el.id === this.selectedElementId);
        if (!element) return;
        
        const typeConfig = ELEMENT_TYPES[element.type];
        const minWidth = typeConfig.minWidth || 100;
        const minHeight = typeConfig.minHeight || 100;
        const maxWidth = typeConfig.maxWidth || 2000;
        const maxHeight = typeConfig.maxHeight || 1500;
        
        let newX = this.resizeStartDimensions.x;
        let newY = this.resizeStartDimensions.y;
        let newWidth = this.resizeStartDimensions.width;
        let newHeight = this.resizeStartDimensions.height;
        
        // Handle each resize direction
        if (this.resizeHandle.includes('e')) {
            newWidth = Math.max(minWidth, Math.min(maxWidth, this.resizeStartDimensions.width + deltaX));
        }
        if (this.resizeHandle.includes('w')) {
            const widthChange = Math.max(-this.resizeStartDimensions.width + minWidth, Math.min(deltaX, this.resizeStartDimensions.width - minWidth));
            newX = this.resizeStartDimensions.x + widthChange;
            newWidth = this.resizeStartDimensions.width - widthChange;
        }
        if (this.resizeHandle.includes('s')) {
            newHeight = Math.max(minHeight, Math.min(maxHeight, this.resizeStartDimensions.height + deltaY));
        }
        if (this.resizeHandle.includes('n')) {
            const heightChange = Math.max(-this.resizeStartDimensions.height + minHeight, Math.min(deltaY, this.resizeStartDimensions.height - minHeight));
            newY = this.resizeStartDimensions.y + heightChange;
            newHeight = this.resizeStartDimensions.height - heightChange;
        }
        
        // Snap to grid (10px)
        newX = Math.round(newX / 10) * 10;
        newY = Math.round(newY / 10) * 10;
        newWidth = Math.round(newWidth / 10) * 10;
        newHeight = Math.round(newHeight / 10) * 10;
        
        const index = this.elements.findIndex(el => el.id === this.selectedElementId);
        if (index !== -1) {
            this.elements[index] = {
                ...this.elements[index],
                x: newX,
                y: newY,
                width: newWidth,
                height: newHeight
            };
            this.elements = [...this.elements];
        }
    }
    
    // Toggle orientation for Pool/Lane
    @api
    toggleOrientation(elementId) {
        const index = this.elements.findIndex(el => el.id === elementId);
        if (index === -1) return;
        
        const element = this.elements[index];
        const typeConfig = ELEMENT_TYPES[element.type];
        
        if (typeConfig.shape !== 'pool' && typeConfig.shape !== 'lane') return;
        
        const newOrientation = element.orientation === 'horizontal' ? 'vertical' : 'horizontal';
        
        // Swap width and height
        this.elements[index] = {
            ...element,
            orientation: newOrientation,
            width: element.height,
            height: element.width
        };
        this.elements = [...this.elements];
        this.notifyCanvasChange();
    }
    
    handleCanvasWheel(event) {
        event.preventDefault();
        
        const delta = event.deltaY > 0 ? -0.1 : 0.1;
        const newZoom = Math.max(0.25, Math.min(4, this.zoom + delta));
        
        this.zoom = newZoom;
    }
    
    handleCanvasDragOver(event) {
        event.preventDefault();
    }
    
    handleCanvasDrop(event) {
        event.preventDefault();
        
        const elementType = event.dataTransfer.getData('elementType');
        if (!elementType) return;
        
        const svgPoint = this.getSvgPoint(event);
        const typeConfig = ELEMENT_TYPES[elementType];
        
        if (typeConfig) {
            const x = svgPoint.x - typeConfig.width / 2;
            const y = svgPoint.y - typeConfig.height / 2;
            
            this.addElement(elementType, x, y);
        }
    }
    
    handleKeyDown(event) {
        if (this.readOnly) return;
        
        switch (event.key) {
            case 'Delete':
            case 'Backspace':
                this.deleteSelected();
                event.preventDefault();
                break;
            case 'Escape':
                if (this.isConnecting) {
                    this.cancelConnection();
                } else {
                    this.clearSelection();
                }
                break;
            default:
                break;
        }
    }
    
    handleKeyUp(event) {
        // Future: handle space key release for pan mode
    }
    
    // =========================================================================
    // HELPER METHODS
    // =========================================================================
    
    getSvgPoint(event) {
        const svg = this.template.querySelector('.canvas-svg');
        if (!svg) return { x: 0, y: 0 };
        
        const rect = svg.getBoundingClientRect();
        const scaledWidth = this.baseViewBox.width / this.zoom;
        const scaledHeight = this.baseViewBox.height / this.zoom;
        const centerX = this.baseViewBox.x + this.baseViewBox.width / 2;
        const centerY = this.baseViewBox.y + this.baseViewBox.height / 2;
        const viewBoxX = centerX - scaledWidth / 2;
        const viewBoxY = centerY - scaledHeight / 2;
        
        const x = viewBoxX + ((event.clientX - rect.left) / rect.width) * scaledWidth;
        const y = viewBoxY + ((event.clientY - rect.top) / rect.height) * scaledHeight;
        
        return { x, y };
    }
    
    getElementAtPoint(point) {
        return this.elements.find(el => 
            point.x >= el.x && 
            point.x <= el.x + el.width &&
            point.y >= el.y && 
            point.y <= el.y + el.height
        );
    }
    
    generateId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    getDefaultName(elementType) {
        const names = {
            StartEvent: 'Start',
            EndEvent: 'End',
            IntermediateEvent: 'Event',
            UserTask: 'Task',
            ServiceTask: 'Service Task',
            ScriptTask: 'Script Task',
            ManualTask: 'Manual Task',
            ExclusiveGateway: 'Gateway',
            ParallelGateway: 'Parallel',
            InclusiveGateway: 'Inclusive',
            SubProcess: 'Sub-Process'
        };
        return names[elementType] || elementType;
    }
    
    cancelConnection() {
        this.isConnecting = false;
        this.connectionStartId = null;
        this.connectionStartSide = null;
        this.connectionStartPoint = null;
        this.tempConnectionEnd = null;
    }
    
    // =========================================================================
    // SELECTION
    // =========================================================================
    
    selectElement(elementId) {
        this.selectedElementId = elementId;
        this.selectedConnectionId = null;
        
        const element = this.elements.find(el => el.id === elementId);
        const renderedEl = this.renderedElements.find(el => el.id === elementId);
        
        this.dispatchEvent(new CustomEvent('selectionchange', {
            detail: { 
                type: 'element',
                element: element ? { 
                    ...element,
                    cfcContribution: renderedEl?.cfcContribution || 0,
                    cfcType: renderedEl?.cfcType || null,
                    isHighRisk: renderedEl?.isHighRisk || false,
                    complexityDescription: renderedEl?.complexityDescription || ''
                } : null
            }
        }));
    }
    
    selectConnection(connectionId) {
        this.selectedConnectionId = connectionId;
        this.selectedElementId = null;
        
        const connection = this.connections.find(c => c.id === connectionId);
        this.dispatchEvent(new CustomEvent('selectionchange', {
            detail: { 
                type: 'connection',
                connection: connection ? { ...connection } : null
            }
        }));
    }
    
    clearSelection() {
        this.selectedElementId = null;
        this.selectedConnectionId = null;
        
        this.dispatchEvent(new CustomEvent('selectionchange', {
            detail: { type: null, element: null, connection: null }
        }));
    }
    
    // =========================================================================
    // CRUD OPERATIONS
    // =========================================================================
    
    createConnection(sourceId, targetId, sourceSide, targetSide, type = 'SequenceFlow') {
        const exists = this.connections.some(
            c => c.sourceId === sourceId && c.targetId === targetId
        );
        if (exists) {
            console.log('Connection already exists');
            return null;
        }
        
        if (!sourceSide || !targetSide) {
            const sourceEl = this.elements.find(el => el.id === sourceId);
            const targetEl = this.elements.find(el => el.id === targetId);
            if (sourceEl && targetEl) {
                const sides = this.calculateBestSides(sourceEl, targetEl);
                sourceSide = sourceSide || sides.sourceSide;
                targetSide = targetSide || sides.targetSide;
            }
        }
        
        const connection = {
            id: this.generateId('conn'),
            type,
            sourceId,
            targetId,
            sourceSide: sourceSide || 'right',
            targetSide: targetSide || 'left',
            label: '',
            condition: '',
            isDefault: false
        };
        
        this.connections = [...this.connections, connection];
        this.selectConnection(connection.id);
        this.notifyCanvasChange();
        
        return connection.id;
    }
    
    deleteElement(elementId) {
        this.elements = this.elements.filter(el => el.id !== elementId);
        this.connections = this.connections.filter(
            c => c.sourceId !== elementId && c.targetId !== elementId
        );
        
        this.clearSelection();
        this.notifyCanvasChange();
    }
    
    deleteConnection(connectionId) {
        this.connections = this.connections.filter(c => c.id !== connectionId);
        this.clearSelection();
        this.notifyCanvasChange();
    }
    
    // =========================================================================
    // NOTIFICATIONS
    // =========================================================================
    
    notifyCanvasChange() {
        this.dispatchEvent(new CustomEvent('canvaschange', {
            detail: {
                elementCount: this.elements.length,
                connectionCount: this.connections.length,
                hasUnsavedChanges: true,
                score: this.calculateProcessScore()
            }
        }));
    }
}