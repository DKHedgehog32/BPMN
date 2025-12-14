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
    }
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
    addElement(elementType, x, y, name) {
        const typeConfig = ELEMENT_TYPES[elementType];
        if (!typeConfig) {
            console.error('Unknown element type:', elementType);
            return null;
        }
        
        const element = {
            id: this.generateId('el'),
            type: elementType,
            name: name || this.getDefaultName(elementType),
            x: x,
            y: y,
            width: typeConfig.width,
            height: typeConfig.height,
            description: '',
            assignedRole: '',
            durationHours: null,
            slaHours: null
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
    // PROCESS QUALITY SCORING
    // =========================================================================
    
    getOutgoingFlows(elementId) {
        return this.connections.filter(c => c.sourceId === elementId);
    }
    
    @api
    calculateProcessScore() {
        let totalCFC = 0;
        let cfcXOR = 0;
        let cfcOR = 0;
        let cfcAND = 0;
        let noajs = 0;
        let noa = 0;
        let orGatewayCount = 0;
        let gatewayCount = 0;
        const issues = [];
        
        this.elements.forEach(el => {
            const typeConfig = ELEMENT_TYPES[el.type];
            if (!typeConfig) return;
            
            if (!['TextAnnotation', 'Group', 'DataObject', 'DataStore'].includes(el.type)) {
                noajs++;
            }
            
            if (el.type.includes('Task') || el.type === 'SubProcess' || el.type === 'CallActivity') {
                noa++;
            }
            
            if (typeConfig.isGateway && typeConfig.cfcFormula) {
                gatewayCount++;
                const outgoing = this.getOutgoingFlows(el.id).length;
                
                if (outgoing > 1) {
                    const cfc = typeConfig.cfcFormula(outgoing);
                    totalCFC += cfc;
                    
                    switch (typeConfig.cfcType) {
                        case 'XOR': cfcXOR += cfc; break;
                        case 'OR':
                            cfcOR += cfc;
                            orGatewayCount++;
                            if (outgoing >= 3) {
                                issues.push({
                                    type: 'warning',
                                    elementId: el.id,
                                    elementName: el.name,
                                    message: `OR gateway "${el.name || 'Unnamed'}" with ${outgoing} paths adds CFC of ${cfc}`,
                                    severity: 'high'
                                });
                            }
                            break;
                        case 'AND': cfcAND += cfc; break;
                        default: break;
                    }
                }
            }
        });
        
        if (noajs > 50) {
            issues.push({
                type: 'error',
                message: `Model has ${noajs} elements (>50). Error probability exceeds 50%. Consider decomposing.`,
                severity: 'critical'
            });
        } else if (noajs > 33) {
            issues.push({
                type: 'warning',
                message: `Model has ${noajs} elements - approaching high complexity threshold (33)`,
                severity: 'medium'
            });
        }
        
        if (orGatewayCount > 2) {
            issues.push({
                type: 'warning',
                message: `Model has ${orGatewayCount} OR gateways. Consider reducing (7PMG G5)`,
                severity: 'medium'
            });
        }
        
        if (totalCFC > 9) {
            issues.push({
                type: 'warning',
                message: `Control-Flow Complexity (CFC) of ${totalCFC} exceeds threshold (9)`,
                severity: 'high'
            });
        }
        
        const dimensions = this.calculateDimensionScores({ totalCFC, noajs, noa, gatewayCount, orGatewayCount });
        
        const totalScore = Math.round(
            dimensions.structural * 0.20 +
            dimensions.controlFlow * 0.30 +
            dimensions.correctness * 0.25 +
            dimensions.naming * 0.15 +
            dimensions.modularity * 0.10
        );
        
        const grade = this.getGrade(totalScore);
        const gradeColors = { 'A': '#22C55E', 'B': '#84CC16', 'C': '#EAB308', 'D': '#F97316', 'F': '#DC2626' };
        
        return {
            total: totalScore,
            grade,
            gradeColor: gradeColors[grade],
            cfc: totalCFC,
            cfcBreakdown: { xor: cfcXOR, or: cfcOR, and: cfcAND },
            noajs,
            noa,
            gatewayCount,
            dimensions,
            issues,
            thresholds: {
                cfc: totalCFC <= 3 ? 'low' : totalCFC <= 9 ? 'moderate' : 'high',
                noajs: noajs <= 17 ? 'low' : noajs <= 33 ? 'moderate' : 'high',
                noa: noa <= 12 ? 'low' : noa <= 26 ? 'moderate' : 'high'
            }
        };
    }
    
    calculateDimensionScores({ totalCFC, noajs, noa, gatewayCount, orGatewayCount }) {
        const structural = Math.max(0, Math.min(100, 
            noajs <= 17 ? 100 :
            noajs <= 33 ? 100 - ((noajs - 17) / 16) * 40 :
            noajs <= 50 ? 60 - ((noajs - 33) / 17) * 40 :
            20 - Math.min(20, (noajs - 50) * 2)
        ));
        
        const controlFlow = Math.max(0, Math.min(100,
            totalCFC <= 3 ? 100 :
            totalCFC <= 9 ? 100 - ((totalCFC - 3) / 6) * 30 :
            totalCFC <= 20 ? 70 - ((totalCFC - 9) / 11) * 50 :
            20 - Math.min(20, (totalCFC - 20) * 2)
        ));
        
        const correctness = Math.max(0, 100 - (orGatewayCount * 10));
        
        const defaultNames = ['Start', 'End', 'Task', 'Gateway', 'Parallel', 'Inclusive', 'Event', 'Service Task', 'Script Task', 'Manual Task', 'Sub-Process'];
        const elementsWithLabels = this.elements.filter(el => 
            el.name && !defaultNames.includes(el.name) && el.name.trim() !== ''
        ).length;
        const naming = this.elements.length > 0 
            ? Math.round((elementsWithLabels / this.elements.length) * 100)
            : 100;
        
        const modularity = Math.max(0, Math.min(100,
            noajs <= 30 ? 100 :
            noajs <= 50 ? 100 - ((noajs - 30) / 20) * 50 :
            50 - Math.min(50, (noajs - 50) * 2)
        ));
        
        return {
            structural: Math.round(structural),
            controlFlow: Math.round(controlFlow),
            correctness: Math.round(correctness),
            naming: Math.round(naming),
            modularity: Math.round(modularity)
        };
    }
    
    getGrade(score) {
        if (score >= 90) return 'A';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 60) return 'D';
        return 'F';
    }
    
    getCfcBadgeColor(cfc) {
        if (cfc >= 7) return '#DC2626';
        if (cfc >= 4) return '#F97316';
        if (cfc >= 1) return '#EAB308';
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
                ...el,
                ...typeConfig,
                centerX,
                centerY,
                radius,
                innerRadius,
                isDiamond,
                isCircle,
                isRect,
                isSelected,
                diamondPoints,
                selectionPoints,
                isXIcon: typeConfig.icon === 'x',
                isPlusIcon: typeConfig.icon === 'plus',
                isCircleIcon: typeConfig.icon === 'o',
                xIconPath,
                plusIconPath,
                circleIconRadius,
                showUserIcon: typeConfig.icon === 'user',
                showServiceIcon: typeConfig.icon === 'service',
                iconTransform: `translate(${el.x + 8}, ${el.y + 8})`,
                labelX: centerX,
                labelY,
                labelInside,
                strokeDasharray: typeConfig.dashed ? '5,3' : 'none',
                connPointTopX,
                connPointTopY,
                connPointRightX,
                connPointRightY,
                connPointBottomX,
                connPointBottomY,
                connPointLeftX,
                connPointLeftY,
                cssClass: `bpmn-element ${isSelected ? 'selected' : ''}`,
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
        const sourcePoint = this.getConnectionPointAtSide(source, sourceSide || 'right');
        const targetPoint = this.getConnectionPointAtSide(target, targetSide || 'left');
        
        return this.createOrthogonalPath(sourcePoint, targetPoint, sourceSide, targetSide);
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
        const r = 8; // Corner radius
        let path = `M ${from.x} ${from.y}`;
        
        // Direction helpers
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const goingRight = dx > 0;
        const goingDown = dy > 0;
        const goingLeft = dx < 0;
        const goingUp = dy < 0;
        
        // If points are nearly aligned, draw straight line
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
            return path + ` L ${to.x} ${to.y}`;
        }
        
        // Straight horizontal line (same Y)
        if (Math.abs(dy) < 5) {
            return path + ` L ${to.x} ${to.y}`;
        }
        
        // Straight vertical line (same X)
        if (Math.abs(dx) < 5) {
            return path + ` L ${to.x} ${to.y}`;
        }
        
        // =====================================================================
        // SIMPLE L-SHAPE PATHS (one corner only)
        // These are the preferred paths when source direction aligns with target
        // =====================================================================
        
        // Exiting RIGHT, target is to the right and target expects LEFT entry
        // Path: → corner ↓ (or ↑)
        if (sourceSide === 'right' && goingRight && targetSide === 'left') {
            // Simple case: go right, then turn to target Y, then go right to target
            // Actually need 2 corners for this, handled below
        }
        
        // Exiting BOTTOM, target is below - simple L-shape
        // Path: ↓ corner → (or ←)
        if (sourceSide === 'bottom' && goingDown) {
            const cornerY = to.y; // Turn at target's Y level
            
            // Only use L-shape if we have room (target Y is below our exit)
            if (to.y > from.y + r * 2) {
                path += ` L ${from.x} ${cornerY - r}`;
                path += ` Q ${from.x} ${cornerY} ${from.x + (goingRight ? r : -r)} ${cornerY}`;
                path += ` L ${to.x} ${to.y}`;
                return path;
            }
        }
        
        // Exiting TOP, target is above - simple L-shape
        // Path: ↑ corner → (or ←)
        if (sourceSide === 'top' && goingUp) {
            const cornerY = to.y; // Turn at target's Y level
            
            // Only use L-shape if we have room
            if (to.y < from.y - r * 2) {
                path += ` L ${from.x} ${cornerY + r}`;
                path += ` Q ${from.x} ${cornerY} ${from.x + (goingRight ? r : -r)} ${cornerY}`;
                path += ` L ${to.x} ${to.y}`;
                return path;
            }
        }
        
        // Exiting LEFT, target is to the left - simple L-shape
        // Path: ← corner ↓ (or ↑)
        if (sourceSide === 'left' && goingLeft) {
            const cornerX = to.x; // Turn at target's X level
            
            if (to.x < from.x - r * 2) {
                path += ` L ${cornerX + r} ${from.y}`;
                path += ` Q ${cornerX} ${from.y} ${cornerX} ${from.y + (goingDown ? r : -r)}`;
                path += ` L ${to.x} ${to.y}`;
                return path;
            }
        }
        
        // Exiting RIGHT, target is to the right - simple L-shape
        // Path: → corner ↓ (or ↑)  
        if (sourceSide === 'right' && goingRight) {
            const cornerX = to.x; // Turn at target's X level
            
            if (to.x > from.x + r * 2) {
                path += ` L ${cornerX - r} ${from.y}`;
                path += ` Q ${cornerX} ${from.y} ${cornerX} ${from.y + (goingDown ? r : -r)}`;
                path += ` L ${to.x} ${to.y}`;
                return path;
            }
        }
        
        // =====================================================================
        // S-SHAPE PATHS (two corners) - when direction conflicts
        // Used when we exit one way but need to go the opposite direction
        // =====================================================================
        
        const horizontalExit = sourceSide === 'left' || sourceSide === 'right';
        const verticalExit = sourceSide === 'top' || sourceSide === 'bottom';
        
        if (horizontalExit) {
            // Source exits horizontally (left or right)
            const exitRight = sourceSide === 'right';
            
            // Calculate midpoint X
            let midX;
            if (exitRight) {
                midX = Math.max(from.x + 30, (from.x + to.x) / 2);
            } else {
                midX = Math.min(from.x - 30, (from.x + to.x) / 2);
            }
            
            // Build S-path with two corners
            const corner1X = exitRight ? midX - r : midX + r;
            const firstCornerY = goingDown ? from.y + r : from.y - r;
            const secondCornerY = goingDown ? to.y - r : to.y + r;
            const corner2X = goingRight ? midX + r : midX - r;
            
            path += ` L ${corner1X} ${from.y}`;
            path += ` Q ${midX} ${from.y} ${midX} ${firstCornerY}`;
            path += ` L ${midX} ${secondCornerY}`;
            path += ` Q ${midX} ${to.y} ${corner2X} ${to.y}`;
            path += ` L ${to.x} ${to.y}`;
            
        } else if (verticalExit) {
            // Source exits vertically (top or bottom)
            const exitBottom = sourceSide === 'bottom';
            
            // Calculate midpoint Y
            let midY;
            if (exitBottom) {
                midY = Math.max(from.y + 30, (from.y + to.y) / 2);
            } else {
                midY = Math.min(from.y - 30, (from.y + to.y) / 2);
            }
            
            // Build S-path with two corners
            const corner1Y = exitBottom ? midY - r : midY + r;
            const firstCornerX = goingRight ? from.x + r : from.x - r;
            const secondCornerX = goingRight ? to.x - r : to.x + r;
            const corner2Y = goingDown ? midY + r : midY - r;
            
            path += ` L ${from.x} ${corner1Y}`;
            path += ` Q ${from.x} ${midY} ${firstCornerX} ${midY}`;
            path += ` L ${secondCornerX} ${midY}`;
            path += ` Q ${to.x} ${midY} ${to.x} ${corner2Y}`;
            path += ` L ${to.x} ${to.y}`;
            
        } else {
            // Fallback: straight line
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