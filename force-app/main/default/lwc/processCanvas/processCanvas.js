/**
 * @description SVG Canvas component for rendering and editing BPMN process diagrams
 * @author Dennis van Musschenbroek (DvM) - Cobra CRM B.V.
 * @date 2024-12-12
 * @version 1.0.2
 * 
 * EXPLANATION:
 * This is the core canvas component for the Process Modeling Studio. It provides:
 * - SVG-based rendering of BPMN 2.0 elements (events, tasks, gateways)
 * - Interactive editing: drag shapes, draw connections, select/delete
 * - Pan and zoom for navigating large diagrams
 * - Keyboard shortcuts for common operations
 * - Canvas state management (JSON serialization)
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
 * CHANGELOG:
 * Version | Date       | Author | Description
 * --------|------------|--------|------------------------------------------
 * 1.0.0   | 2024-12-12 | DvM    | Initial creation - core canvas functionality
 * 1.0.1   | 2024-12-12 | DvM    | Fixed: pre-calculate all SVG attributes
 * 1.0.2   | 2024-12-12 | DvM    | Fixed: zoom now scales viewBox, connection drawing works
 */
import { LightningElement, api, track } from 'lwc';

// BPMN element type definitions with rendering properties
// POC Style: Softer fills, dark strokes, clean look
const ELEMENT_TYPES = {
    // Events - Light green fill, dark stroke
    StartEvent: { width: 50, height: 50, shape: 'circle', fill: '#C6F6D5', stroke: '#2D3748', strokeWidth: 2 },
    EndEvent: { width: 50, height: 50, shape: 'circle', fill: '#FED7D7', stroke: '#2D3748', strokeWidth: 3 },
    IntermediateEvent: { width: 50, height: 50, shape: 'circle', fill: '#BEE3F8', stroke: '#2D3748', strokeWidth: 2, double: true },
    TimerStartEvent: { width: 50, height: 50, shape: 'circle', fill: '#C6F6D5', stroke: '#2D3748', strokeWidth: 2, icon: 'timer' },
    MessageStartEvent: { width: 50, height: 50, shape: 'circle', fill: '#C6F6D5', stroke: '#2D3748', strokeWidth: 2, icon: 'message' },
    
    // Tasks - Light blue fill, dark stroke, rounded corners
    UserTask: { width: 140, height: 70, shape: 'rect', fill: '#BEE3F8', stroke: '#2D3748', strokeWidth: 2, rx: 12, icon: 'user' },
    ServiceTask: { width: 140, height: 70, shape: 'rect', fill: '#BEE3F8', stroke: '#2D3748', strokeWidth: 2, rx: 12, icon: 'service' },
    ScriptTask: { width: 140, height: 70, shape: 'rect', fill: '#BEE3F8', stroke: '#2D3748', strokeWidth: 2, rx: 12, icon: 'script' },
    ManualTask: { width: 140, height: 70, shape: 'rect', fill: '#BEE3F8', stroke: '#2D3748', strokeWidth: 2, rx: 12, icon: 'manual' },
    BusinessRuleTask: { width: 140, height: 70, shape: 'rect', fill: '#BEE3F8', stroke: '#2D3748', strokeWidth: 2, rx: 12, icon: 'rule' },
    SendTask: { width: 140, height: 70, shape: 'rect', fill: '#BEE3F8', stroke: '#2D3748', strokeWidth: 2, rx: 12, icon: 'send' },
    ReceiveTask: { width: 140, height: 70, shape: 'rect', fill: '#BEE3F8', stroke: '#2D3748', strokeWidth: 2, rx: 12, icon: 'receive' },
    
    // Gateways - Light yellow fill, dark stroke
    ExclusiveGateway: { width: 50, height: 50, shape: 'diamond', fill: '#FEFCBF', stroke: '#2D3748', strokeWidth: 2, icon: 'x' },
    ParallelGateway: { width: 50, height: 50, shape: 'diamond', fill: '#FEFCBF', stroke: '#2D3748', strokeWidth: 2, icon: 'plus' },
    InclusiveGateway: { width: 50, height: 50, shape: 'diamond', fill: '#FEFCBF', stroke: '#2D3748', strokeWidth: 2, icon: 'circle' },
    EventBasedGateway: { width: 50, height: 50, shape: 'diamond', fill: '#FEFCBF', stroke: '#2D3748', strokeWidth: 2, icon: 'pentagon' },
    
    // Sub-Process - Light purple fill
    SubProcess: { width: 160, height: 100, shape: 'rect', fill: '#E9D8FD', stroke: '#2D3748', strokeWidth: 2, rx: 12, dashed: true },
    CallActivity: { width: 140, height: 70, shape: 'rect', fill: '#E9D8FD', stroke: '#2D3748', strokeWidth: 3, rx: 12 },
    
    // Data - Light gray fill
    DataObject: { width: 40, height: 50, shape: 'document', fill: '#EDF2F7', stroke: '#2D3748', strokeWidth: 1.5 },
    DataStore: { width: 50, height: 50, shape: 'cylinder', fill: '#EDF2F7', stroke: '#2D3748', strokeWidth: 1.5 },
    
    // Artifacts
    TextAnnotation: { width: 120, height: 60, shape: 'annotation', fill: '#FFFAF0', stroke: '#2D3748', strokeWidth: 1 },
    Group: { width: 200, height: 150, shape: 'rect', fill: 'none', stroke: '#718096', strokeWidth: 1.5, dashed: true, rx: 12 }
};

// Connection type styles - POC style with dark strokes
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
    
    // Get current canvas state as JSON
    @api
    getCanvasState() {
        return JSON.stringify({
            elements: this.elements,
            connections: this.connections,
            viewBox: this.baseViewBox,
            zoom: this.zoom
        });
    }
    
    // Load canvas state from JSON
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
    
    // Add element from palette drop
    @api
    addElement(elementType, x, y, name) {
        const typeConfig = ELEMENT_TYPES[elementType];
        if (!typeConfig) {
            console.error('Unknown element type:', elementType);
            return null;
        }
        
        const element = {
            id: this.generateId('elem'),
            type: elementType,
            name: name || this.getDefaultName(elementType),
            x: x - typeConfig.width / 2,
            y: y - typeConfig.height / 2,
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
    
    // Delete selected element(s)
    @api
    deleteSelected() {
        if (this.selectedElementId) {
            this.deleteElement(this.selectedElementId);
        } else if (this.selectedConnectionId) {
            this.deleteConnection(this.selectedConnectionId);
        }
    }
    
    // Zoom controls - adjust viewBox to zoom
    @api
    zoomIn() {
        this.zoom = Math.min(this.zoom * 1.2, 3);
        this.applyZoom();
    }
    
    @api
    zoomOut() {
        this.zoom = Math.max(this.zoom / 1.2, 0.3);
        this.applyZoom();
    }
    
    @api
    zoomFit() {
        if (this.elements.length === 0) {
            this.zoom = 1;
            this.baseViewBox = { x: 0, y: 0, width: 1200, height: 800 };
            return;
        }
        
        // Calculate bounding box of all elements
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.elements.forEach(el => {
            minX = Math.min(minX, el.x);
            minY = Math.min(minY, el.y);
            maxX = Math.max(maxX, el.x + el.width);
            maxY = Math.max(maxY, el.y + el.height);
        });
        
        const padding = 50;
        this.baseViewBox = {
            x: minX - padding,
            y: minY - padding,
            width: maxX - minX + padding * 2,
            height: maxY - minY + padding * 2
        };
        this.zoom = 1;
    }
    
    @api
    zoomReset() {
        this.zoom = 1;
        this.baseViewBox = { x: 0, y: 0, width: 1200, height: 800 };
    }
    
    // Update selected element properties
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
        // Add keyboard listener to container
        const container = this.template.querySelector('.canvas-container');
        if (container) {
            container.addEventListener('keydown', this.handleKeyDown.bind(this));
        }
    }
    
    // =========================================================================
    // ZOOM HELPERS
    // =========================================================================
    
    applyZoom() {
        // Zoom is applied through the viewBox calculation in the getter
        // This method can be extended for center-based zooming
    }
    
    // =========================================================================
    // RENDERING GETTERS
    // =========================================================================
    
    /**
     * Calculate the actual viewBox based on base viewBox and zoom level
     * Zooming in (zoom > 1) = smaller viewBox = things appear bigger
     * Zooming out (zoom < 1) = larger viewBox = things appear smaller
     */
    get viewBoxString() {
        const scaledWidth = this.baseViewBox.width / this.zoom;
        const scaledHeight = this.baseViewBox.height / this.zoom;
        
        // Keep the center point the same when zooming
        const centerX = this.baseViewBox.x + this.baseViewBox.width / 2;
        const centerY = this.baseViewBox.y + this.baseViewBox.height / 2;
        const x = centerX - scaledWidth / 2;
        const y = centerY - scaledHeight / 2;
        
        return `${x} ${y} ${scaledWidth} ${scaledHeight}`;
    }
    
    get zoomPercentage() {
        return Math.round(this.zoom * 100);
    }
    
    // Temp connection line coordinates - from source element center to mouse position
    get tempLineX1() {
        if (!this.connectionStartId) return 0;
        const el = this.elements.find(e => e.id === this.connectionStartId);
        if (!el) return 0;
        
        // If we have a start point (from connection handle), use that
        if (this.connectionStartPoint) {
            return this.connectionStartPoint.x;
        }
        // Otherwise use element center
        return el.x + el.width / 2;
    }
    
    get tempLineY1() {
        if (!this.connectionStartId) return 0;
        const el = this.elements.find(e => e.id === this.connectionStartId);
        if (!el) return 0;
        
        if (this.connectionStartPoint) {
            return this.connectionStartPoint.y;
        }
        return el.y + el.height / 2;
    }
    
    get tempLineX2() {
        return this.tempConnectionEnd ? this.tempConnectionEnd.x : this.tempLineX1;
    }
    
    get tempLineY2() {
        return this.tempConnectionEnd ? this.tempConnectionEnd.y : this.tempLineY1;
    }
    
    // Get rendered elements with all computed properties
    get renderedElements() {
        return this.elements.map(el => {
            const typeConfig = ELEMENT_TYPES[el.type] || ELEMENT_TYPES.UserTask;
            const isSelected = el.id === this.selectedElementId;
            
            // Pre-calculate all geometry values
            const centerX = el.x + el.width / 2;
            const centerY = el.y + el.height / 2;
            const radius = el.width / 2;
            const innerRadius = radius - 4;
            const isDiamond = typeConfig.shape === 'diamond';
            const isCircle = typeConfig.shape === 'circle';
            const isRect = typeConfig.shape === 'rect';
            
            // Diamond points for gateways (with rounded corners effect)
            const diamondPoints = isDiamond 
                ? `${centerX},${el.y} ${el.x + el.width},${centerY} ${centerX},${el.y + el.height} ${el.x},${centerY}`
                : '';
            
            // Gateway icon paths - centered in diamond
            const iconOffset = 10;
            const xIconPath = `M${centerX - iconOffset} ${centerY - iconOffset} L${centerX + iconOffset} ${centerY + iconOffset} M${centerX + iconOffset} ${centerY - iconOffset} L${centerX - iconOffset} ${centerY + iconOffset}`;
            const plusIconPath = `M${centerX} ${centerY - iconOffset} L${centerX} ${centerY + iconOffset} M${centerX - iconOffset} ${centerY} L${centerX + iconOffset} ${centerY}`;
            const circleIconRadius = 10;
            
            // Icon position - centered in element
            const iconSize = 16;
            const iconX = centerX - iconSize / 2;
            const iconY = centerY - iconSize / 2 - 5; // Slightly above center for events with labels
            
            // Label position - BELOW the element (not inside)
            const labelOffset = 8; // Gap between element and label
            let labelY;
            if (isCircle) {
                labelY = el.y + el.height + labelOffset + 12; // Below circle
            } else if (isDiamond) {
                labelY = el.y + el.height + labelOffset + 12; // Below diamond
            } else {
                labelY = centerY; // Center for rectangles (tasks show name inside)
            }
            
            // For tasks (rectangles), label goes inside; for events/gateways, below
            const labelInside = isRect;
            
            // Connection points - different positions for diamonds vs others
            let connPointTopX, connPointTopY, connPointRightX, connPointRightY;
            let connPointBottomX, connPointBottomY, connPointLeftX, connPointLeftY;
            
            if (isDiamond) {
                // For diamonds: connection points on the 4 corners of the diamond
                connPointTopX = centerX;
                connPointTopY = el.y;
                connPointRightX = el.x + el.width;
                connPointRightY = centerY;
                connPointBottomX = centerX;
                connPointBottomY = el.y + el.height;
                connPointLeftX = el.x;
                connPointLeftY = centerY;
            } else if (isCircle) {
                // For circles: connection points on the circumference
                connPointTopX = centerX;
                connPointTopY = el.y;
                connPointRightX = el.x + el.width;
                connPointRightY = centerY;
                connPointBottomX = centerX;
                connPointBottomY = el.y + el.height;
                connPointLeftX = el.x;
                connPointLeftY = centerY;
            } else {
                // For rectangles: connection points on edges
                connPointTopX = centerX;
                connPointTopY = el.y;
                connPointRightX = el.x + el.width;
                connPointRightY = centerY;
                connPointBottomX = centerX;
                connPointBottomY = el.y + el.height;
                connPointLeftX = el.x;
                connPointLeftY = centerY;
            }
            
            return {
                ...el,
                ...typeConfig,
                isSelected,
                cssClass: `bpmn-element bpmn-${el.type.toLowerCase()} ${isSelected ? 'selected' : ''}`,
                
                // Computed geometry
                centerX,
                centerY,
                radius,
                innerRadius,
                diamondPoints,
                xIconPath,
                plusIconPath,
                circleIconRadius,
                
                // Shape type booleans (for template conditionals)
                isCircle,
                isRect,
                isDiamond,
                
                // Icon type booleans
                isXIcon: typeConfig.icon === 'x',
                isPlusIcon: typeConfig.icon === 'plus',
                isCircleIcon: typeConfig.icon === 'circle',
                showUserIcon: typeConfig.icon === 'user',
                showServiceIcon: typeConfig.icon === 'service',
                showScriptIcon: typeConfig.icon === 'script',
                showTimerIcon: typeConfig.icon === 'timer',
                showMessageIcon: typeConfig.icon === 'message',
                
                // Icon transform for task icons (top-left corner)
                iconTransform: `translate(${el.x + 5}, ${el.y + 5})`,
                
                // Icon position (centered) for event icons
                iconX,
                iconY,
                iconSize,
                
                // Timer icon path (clock hands)
                timerHandV: `M${centerX} ${centerY} L${centerX} ${centerY - 8}`,
                timerHandH: `M${centerX} ${centerY} L${centerX + 6} ${centerY}`,
                
                // Message icon coordinates
                messageX: centerX - 10,
                messageY: centerY - 7,
                messageWidth: 20,
                messageHeight: 14,
                messagePath: `M${centerX - 10} ${centerY - 7} L${centerX} ${centerY} L${centerX + 10} ${centerY - 7}`,
                
                // Selection - for POC style, we overlay the shape stroke
                selectionX: el.x - 4,
                selectionY: el.y - 4,
                selectionWidth: el.width + 8,
                selectionHeight: el.height + 8,
                
                // For diamond selection, use same points with slight offset
                selectionDiamondPoints: isDiamond 
                    ? `${centerX},${el.y - 4} ${el.x + el.width + 4},${centerY} ${centerX},${el.y + el.height + 4} ${el.x - 4},${centerY}`
                    : '',
                
                // Label position - below for events/gateways, inside for tasks
                labelX: centerX,
                labelY,
                labelInside,
                
                // Stroke dasharray for dashed elements
                strokeDasharray: typeConfig.dashed ? '5,3' : 'none',
                
                // Connection points
                connPointTopX,
                connPointTopY,
                connPointRightX,
                connPointRightY,
                connPointBottomX,
                connPointBottomY,
                connPointLeftX,
                connPointLeftY
            };
        });
    }
    
    // Get rendered connections with path data
    get renderedConnections() {
        return this.connections.map(conn => {
            const typeConfig = CONNECTION_TYPES[conn.type] || CONNECTION_TYPES.SequenceFlow;
            const sourceEl = this.elements.find(el => el.id === conn.sourceId);
            const targetEl = this.elements.find(el => el.id === conn.targetId);
            
            if (!sourceEl || !targetEl) return null;
            
            // Pass the stored sides to the path calculation
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
    
    // Calculate SVG path between two elements using stored connection sides
    calculateConnectionPath(source, target, sourceSide, targetSide) {
        // Get the exact connection points based on stored sides
        const sourcePoint = this.getConnectionPointAtSide(source, sourceSide || 'right');
        const targetPoint = this.getConnectionPointAtSide(target, targetSide || 'left');
        
        // Create orthogonal path with proper routing
        return this.createOrthogonalPath(sourcePoint, targetPoint, sourceSide, targetSide);
    }
    
    // Get connection point at a specific side
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
            }
        } else if (typeConfig.shape === 'diamond') {
            const halfWidth = element.width / 2;
            const halfHeight = element.height / 2;
            switch (side) {
                case 'top': return { x: centerX, y: element.y };
                case 'right': return { x: element.x + element.width, y: centerY };
                case 'bottom': return { x: centerX, y: element.y + element.height };
                case 'left': return { x: element.x, y: centerY };
            }
        } else {
            // Rectangle
            switch (side) {
                case 'top': return { x: centerX, y: element.y };
                case 'right': return { x: element.x + element.width, y: centerY };
                case 'bottom': return { x: centerX, y: element.y + element.height };
                case 'left': return { x: element.x, y: centerY };
            }
        }
        return { x: centerX, y: centerY };
    }
    
    // Create orthogonal path with rounded corners based on exit/entry sides
    // The path always goes STRAIGHT out from the source side first, then turns toward target
    createOrthogonalPath(from, to, sourceSide, targetSide) {
        const radius = 10; // Corner radius
        
        // Determine exit and entry directions
        // sourceSide: which side of source element we exit from
        // targetSide: which side of target element we enter
        
        // Calculate minimum extension distance (how far to go before first turn)
        const minExtension = 20;
        
        let path = `M ${from.x} ${from.y}`;
        
        // First segment: go straight out from source in the direction of sourceSide
        let seg1End = { x: from.x, y: from.y };
        
        switch (sourceSide) {
            case 'top':
                seg1End.y = Math.min(from.y - minExtension, to.y - minExtension);
                break;
            case 'bottom':
                seg1End.y = Math.max(from.y + minExtension, to.y + minExtension);
                break;
            case 'left':
                seg1End.x = Math.min(from.x - minExtension, to.x - minExtension);
                break;
            case 'right':
                seg1End.x = Math.max(from.x + minExtension, to.x + minExtension);
                break;
        }
        
        // Last segment: go straight into target from targetSide direction
        let seg3Start = { x: to.x, y: to.y };
        
        switch (targetSide) {
            case 'top':
                seg3Start.y = to.y - minExtension;
                break;
            case 'bottom':
                seg3Start.y = to.y + minExtension;
                break;
            case 'left':
                seg3Start.x = to.x - minExtension;
                break;
            case 'right':
                seg3Start.x = to.x + minExtension;
                break;
        }
        
        // Determine if we need one corner or two
        const isSourceVertical = sourceSide === 'top' || sourceSide === 'bottom';
        const isTargetVertical = targetSide === 'top' || targetSide === 'bottom';
        
        if (isSourceVertical !== isTargetVertical) {
            // One corner needed - source and target are perpendicular
            // Corner point is where vertical meets horizontal
            const cornerX = isSourceVertical ? from.x : to.x;
            const cornerY = isSourceVertical ? to.y : from.y;
            
            // Adjust for target entry
            const adjCornerX = isSourceVertical ? from.x : (targetSide === 'left' ? to.x - minExtension : (targetSide === 'right' ? to.x + minExtension : to.x));
            const adjCornerY = isSourceVertical ? (targetSide === 'top' ? to.y - minExtension : (targetSide === 'bottom' ? to.y + minExtension : to.y)) : from.y;
            
            const finalCornerX = isSourceVertical ? from.x : adjCornerX;
            const finalCornerY = isSourceVertical ? adjCornerY : from.y;
            
            // Calculate curve
            const r = Math.min(radius, 
                Math.abs(finalCornerY - from.y) / 2, 
                Math.abs(to.x - finalCornerX) / 2,
                Math.abs(finalCornerX - from.x) / 2,
                Math.abs(to.y - finalCornerY) / 2
            );
            
            if (r < 3) {
                path += ` L ${finalCornerX} ${finalCornerY} L ${to.x} ${to.y}`;
            } else {
                if (isSourceVertical) {
                    // Going vertical first, then horizontal
                    const goingDown = finalCornerY > from.y;
                    const goingRight = to.x > finalCornerX;
                    const curveStartY = goingDown ? finalCornerY - r : finalCornerY + r;
                    const curveEndX = goingRight ? finalCornerX + r : finalCornerX - r;
                    path += ` L ${finalCornerX} ${curveStartY} Q ${finalCornerX} ${finalCornerY} ${curveEndX} ${finalCornerY} L ${to.x} ${to.y}`;
                } else {
                    // Going horizontal first, then vertical
                    const goingRight = finalCornerX > from.x;
                    const goingDown = to.y > finalCornerY;
                    const curveStartX = goingRight ? finalCornerX - r : finalCornerX + r;
                    const curveEndY = goingDown ? finalCornerY + r : finalCornerY - r;
                    path += ` L ${curveStartX} ${finalCornerY} Q ${finalCornerX} ${finalCornerY} ${finalCornerX} ${curveEndY} L ${to.x} ${to.y}`;
                }
            }
        } else {
            // Two corners needed - both source and target are same orientation
            if (isSourceVertical) {
                // Both vertical - S-shape with horizontal middle
                const midY = (from.y + to.y) / 2;
                
                // First corner
                const corner1 = { x: from.x, y: midY };
                // Second corner
                const corner2 = { x: to.x, y: midY };
                
                const r = Math.min(radius, 
                    Math.abs(midY - from.y) / 2, 
                    Math.abs(to.x - from.x) / 2,
                    Math.abs(to.y - midY) / 2
                );
                
                if (r < 3) {
                    path += ` L ${corner1.x} ${corner1.y} L ${corner2.x} ${corner2.y} L ${to.x} ${to.y}`;
                } else {
                    const goingDown1 = midY > from.y;
                    const goingRight = to.x > from.x;
                    const goingDown2 = to.y > midY;
                    
                    // First corner curves
                    const c1StartY = goingDown1 ? midY - r : midY + r;
                    const c1EndX = goingRight ? from.x + r : from.x - r;
                    
                    // Second corner curves
                    const c2StartX = goingRight ? to.x - r : to.x + r;
                    const c2EndY = goingDown2 ? midY + r : midY - r;
                    
                    path += ` L ${from.x} ${c1StartY}`;
                    path += ` Q ${from.x} ${midY} ${c1EndX} ${midY}`;
                    path += ` L ${c2StartX} ${midY}`;
                    path += ` Q ${to.x} ${midY} ${to.x} ${c2EndY}`;
                    path += ` L ${to.x} ${to.y}`;
                }
            } else {
                // Both horizontal - S-shape with vertical middle
                const midX = (from.x + to.x) / 2;
                
                const r = Math.min(radius, 
                    Math.abs(midX - from.x) / 2, 
                    Math.abs(to.y - from.y) / 2,
                    Math.abs(to.x - midX) / 2
                );
                
                if (r < 3) {
                    path += ` L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`;
                } else {
                    const goingRight1 = midX > from.x;
                    const goingDown = to.y > from.y;
                    const goingRight2 = to.x > midX;
                    
                    // First corner curves
                    const c1StartX = goingRight1 ? midX - r : midX + r;
                    const c1EndY = goingDown ? from.y + r : from.y - r;
                    
                    // Second corner curves
                    const c2StartY = goingDown ? to.y - r : to.y + r;
                    const c2EndX = goingRight2 ? midX + r : midX - r;
                    
                    path += ` L ${c1StartX} ${from.y}`;
                    path += ` Q ${midX} ${from.y} ${midX} ${c1EndY}`;
                    path += ` L ${midX} ${c2StartY}`;
                    path += ` Q ${midX} ${to.y} ${c2EndX} ${to.y}`;
                    path += ` L ${to.x} ${to.y}`;
                }
            }
        }
        
        return path;
    }
    
    // Get point on element boundary closest to target point
    getConnectionPoint(element, targetPoint) {
        const centerX = element.x + element.width / 2;
        const centerY = element.y + element.height / 2;
        const typeConfig = ELEMENT_TYPES[element.type] || ELEMENT_TYPES.UserTask;
        
        // Calculate direction vector from center to target
        const dx = targetPoint.x - centerX;
        const dy = targetPoint.y - centerY;
        
        if (typeConfig.shape === 'circle') {
            const radius = element.width / 2;
            const length = Math.sqrt(dx * dx + dy * dy);
            if (length === 0) return { x: centerX + radius, y: centerY };
            
            return {
                x: centerX + (dx / length) * radius,
                y: centerY + (dy / length) * radius
            };
        } else if (typeConfig.shape === 'diamond') {
            // Diamond vertices are at top, right, bottom, left
            const halfWidth = element.width / 2;
            const halfHeight = element.height / 2;
            
            // For a diamond, we need to find where the line from center intersects the edge
            // Diamond edges connect: top-right, right-bottom, bottom-left, left-top
            
            if (dx === 0 && dy === 0) return { x: centerX, y: centerY - halfHeight };
            
            // Normalize direction
            const length = Math.sqrt(dx * dx + dy * dy);
            const ndx = dx / length;
            const ndy = dy / length;
            
            // The diamond can be described by |x/halfWidth| + |y/halfHeight| = 1
            // We need to find t such that |t*ndx/halfWidth| + |t*ndy/halfHeight| = 1
            // t = 1 / (|ndx|/halfWidth + |ndy|/halfHeight)
            const t = 1 / (Math.abs(ndx) / halfWidth + Math.abs(ndy) / halfHeight);
            
            return {
                x: centerX + ndx * t,
                y: centerY + ndy * t
            };
        } else {
            // Rectangle - find intersection with rectangle edge
            const halfWidth = element.width / 2;
            const halfHeight = element.height / 2;
            
            if (dx === 0 && dy === 0) return { x: centerX + halfWidth, y: centerY };
            
            // Calculate intersection with each edge and find the closest one
            let t = Infinity;
            
            // Right edge (x = halfWidth)
            if (dx > 0) {
                const tRight = halfWidth / dx;
                const yAtRight = dy * tRight;
                if (Math.abs(yAtRight) <= halfHeight && tRight < t) {
                    t = tRight;
                }
            }
            // Left edge (x = -halfWidth)
            if (dx < 0) {
                const tLeft = -halfWidth / dx;
                const yAtLeft = dy * tLeft;
                if (Math.abs(yAtLeft) <= halfHeight && tLeft < t) {
                    t = tLeft;
                }
            }
            // Bottom edge (y = halfHeight)
            if (dy > 0) {
                const tBottom = halfHeight / dy;
                const xAtBottom = dx * tBottom;
                if (Math.abs(xAtBottom) <= halfWidth && tBottom < t) {
                    t = tBottom;
                }
            }
            // Top edge (y = -halfHeight)
            if (dy < 0) {
                const tTop = -halfHeight / dy;
                const xAtTop = dx * tTop;
                if (Math.abs(xAtTop) <= halfWidth && tTop < t) {
                    t = tTop;
                }
            }
            
            return {
                x: centerX + dx * t,
                y: centerY + dy * t
            };
        }
    }
    
    // =========================================================================
    // EVENT HANDLERS - Mouse
    // =========================================================================
    
    handleCanvasMouseDown(event) {
        if (this.readOnly) return;
        
        // Middle mouse button always pans
        if (event.button === 1) {
            this.isPanning = true;
            this.panStart = { x: event.clientX, y: event.clientY };
            this.panViewBoxStart = { x: this.baseViewBox.x, y: this.baseViewBox.y };
            event.preventDefault();
            return;
        }
        
        // Left click
        if (event.button === 0) {
            // Shift+click for panning
            if (event.shiftKey) {
                this.isPanning = true;
                this.panStart = { x: event.clientX, y: event.clientY };
                this.panViewBoxStart = { x: this.baseViewBox.x, y: this.baseViewBox.y };
                event.preventDefault();
                return;
            }
            
            // Click on background - start panning OR clear selection
            if (event.target.classList.contains('canvas-background') || 
                event.target.classList.contains('canvas-svg')) {
                // Cancel connection if in progress
                if (this.isConnecting) {
                    this.cancelConnection();
                    return;
                }
                
                // Start panning on background drag
                this.isPanning = true;
                this.panStart = { x: event.clientX, y: event.clientY };
                this.panViewBoxStart = { x: this.baseViewBox.x, y: this.baseViewBox.y };
                
                // Also clear selection
                this.clearSelection();
            }
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
            return;
        }
        
        // Handle element dragging
        if (this.isDragging && this.selectedElementId) {
            const svgPoint = this.getSvgPoint(event);
            const index = this.elements.findIndex(el => el.id === this.selectedElementId);
            if (index !== -1) {
                this.elements[index] = {
                    ...this.elements[index],
                    x: svgPoint.x - this.dragOffset.x,
                    y: svgPoint.y - this.dragOffset.y
                };
                this.elements = [...this.elements];
            }
            return;
        }
        
        // Handle connection drawing - update temp line endpoint
        if (this.isConnecting) {
            this.tempConnectionEnd = this.getSvgPoint(event);
            return;
        }
    }
    
    handleCanvasMouseUp(event) {
        if (this.isPanning) {
            this.isPanning = false;
            return;
        }
        
        if (this.isDragging) {
            this.isDragging = false;
            this.notifyCanvasChange();
            return;
        }
        
        // Handle connection creation
        if (this.isConnecting) {
            const svgPoint = this.getSvgPoint(event);
            const targetElement = this.getElementAtPoint(svgPoint);
            
            if (targetElement && targetElement.id !== this.connectionStartId) {
                // Determine target side based on where the line ends relative to target center
                const targetCenter = {
                    x: targetElement.x + targetElement.width / 2,
                    y: targetElement.y + targetElement.height / 2
                };
                const dx = svgPoint.x - targetCenter.x;
                const dy = svgPoint.y - targetCenter.y;
                
                let targetSide;
                if (Math.abs(dx) > Math.abs(dy)) {
                    targetSide = dx > 0 ? 'right' : 'left';
                } else {
                    targetSide = dy > 0 ? 'bottom' : 'top';
                }
                
                // Create connection with specific sides
                this.createConnection(
                    this.connectionStartId, 
                    targetElement.id, 
                    this.connectionStartSide, 
                    targetSide
                );
            }
            
            // End connection mode
            this.cancelConnection();
        }
    }
    
    handleCanvasWheel(event) {
        event.preventDefault();
        
        // Get mouse position before zoom
        const svgPointBefore = this.getSvgPoint(event);
        
        // Apply zoom
        const delta = event.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.3, Math.min(3, this.zoom * delta));
        
        if (newZoom !== this.zoom) {
            this.zoom = newZoom;
            
            // Adjust viewBox to zoom toward mouse position
            // This keeps the point under the mouse stationary
            const svgPointAfter = this.getSvgPoint(event);
            this.baseViewBox = {
                ...this.baseViewBox,
                x: this.baseViewBox.x + (svgPointBefore.x - svgPointAfter.x),
                y: this.baseViewBox.y + (svgPointBefore.y - svgPointAfter.y)
            };
        }
    }
    
    handleElementMouseDown(event) {
        if (this.readOnly) return;
        
        const elementId = event.currentTarget.dataset.id;
        this.selectElement(elementId);
        
        // Start dragging
        this.isDragging = true;
        const svgPoint = this.getSvgPoint(event);
        const element = this.elements.find(el => el.id === elementId);
        if (element) {
            this.dragOffset = {
                x: svgPoint.x - element.x,
                y: svgPoint.y - element.y
            };
        }
        
        event.stopPropagation();
    }
    
    handleElementDoubleClick(event) {
        const elementId = event.currentTarget.dataset.id;
        this.dispatchEvent(new CustomEvent('elementdoubleclick', {
            detail: { elementId }
        }));
    }
    
    /**
     * Start connection drawing from a connection point
     */
    handleConnectionPointMouseDown(event) {
        if (this.readOnly) return;
        
        event.stopPropagation();
        event.preventDefault();
        
        const elementId = event.currentTarget.dataset.elementid;
        const position = event.currentTarget.dataset.position; // top, right, bottom, left
        
        // Get the element to calculate start point
        const element = this.elements.find(el => el.id === elementId);
        if (!element) return;
        
        // Calculate the connection point coordinates
        const centerX = element.x + element.width / 2;
        const centerY = element.y + element.height / 2;
        let startPoint;
        
        switch (position) {
            case 'top':
                startPoint = { x: centerX, y: element.y };
                break;
            case 'right':
                startPoint = { x: element.x + element.width, y: centerY };
                break;
            case 'bottom':
                startPoint = { x: centerX, y: element.y + element.height };
                break;
            case 'left':
                startPoint = { x: element.x, y: centerY };
                break;
            default:
                startPoint = { x: centerX, y: centerY };
        }
        
        // Start connection mode
        this.isConnecting = true;
        this.connectionStartId = elementId;
        this.connectionStartSide = position; // Store which side we started from
        this.connectionStartPoint = startPoint;
        this.tempConnectionEnd = startPoint; // Initialize to same point
        
        console.log('Started connection from element:', elementId, 'at position:', position);
    }
    
    handleConnectionClick(event) {
        const connectionId = event.currentTarget.dataset.id;
        this.selectConnection(connectionId);
        event.stopPropagation();
    }
    
    /**
     * Cancel connection drawing
     */
    cancelConnection() {
        this.isConnecting = false;
        this.connectionStartId = null;
        this.connectionStartSide = null;
        this.connectionStartPoint = null;
        this.tempConnectionEnd = null;
    }
    
    // =========================================================================
    // EVENT HANDLERS - Keyboard
    // =========================================================================
    
    handleKeyDown(event) {
        if (this.readOnly) return;
        
        switch (event.key) {
            case 'Delete':
            case 'Backspace':
                this.deleteSelected();
                event.preventDefault();
                break;
            case 'Escape':
                this.clearSelection();
                this.cancelConnection();
                break;
            case '+':
            case '=':
                if (event.ctrlKey || event.metaKey) {
                    this.zoomIn();
                    event.preventDefault();
                }
                break;
            case '-':
                if (event.ctrlKey || event.metaKey) {
                    this.zoomOut();
                    event.preventDefault();
                }
                break;
            case '0':
                if (event.ctrlKey || event.metaKey) {
                    this.zoomFit();
                    event.preventDefault();
                }
                break;
        }
    }
    
    // =========================================================================
    // EVENT HANDLERS - Drag & Drop from Palette
    // =========================================================================
    
    handleCanvasDragOver(event) {
        if (this.readOnly) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    }
    
    handleCanvasDrop(event) {
        if (this.readOnly) return;
        event.preventDefault();
        
        const elementType = event.dataTransfer.getData('elementType');
        if (!elementType) return;
        
        const svgPoint = this.getSvgPoint(event);
        this.addElement(elementType, svgPoint.x, svgPoint.y);
    }
    
    // =========================================================================
    // HELPER METHODS
    // =========================================================================
    
    /**
     * Convert screen coordinates to SVG coordinates
     */
    getSvgPoint(event) {
        const svg = this.template.querySelector('.canvas-svg');
        if (!svg) return { x: 0, y: 0 };
        
        const rect = svg.getBoundingClientRect();
        
        // Calculate the current viewBox dimensions (with zoom applied)
        const scaledWidth = this.baseViewBox.width / this.zoom;
        const scaledHeight = this.baseViewBox.height / this.zoom;
        const centerX = this.baseViewBox.x + this.baseViewBox.width / 2;
        const centerY = this.baseViewBox.y + this.baseViewBox.height / 2;
        const viewBoxX = centerX - scaledWidth / 2;
        const viewBoxY = centerY - scaledHeight / 2;
        
        // Map screen coordinates to SVG coordinates
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
    
    // =========================================================================
    // SELECTION
    // =========================================================================
    
    selectElement(elementId) {
        this.selectedElementId = elementId;
        this.selectedConnectionId = null;
        
        const element = this.elements.find(el => el.id === elementId);
        this.dispatchEvent(new CustomEvent('selectionchange', {
            detail: { 
                type: 'element',
                element: element ? { ...element } : null
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
    
    createConnection(sourceId, targetId, sourceSide = null, targetSide = null, type = 'SequenceFlow') {
        // Check if connection already exists
        const exists = this.connections.some(
            c => c.sourceId === sourceId && c.targetId === targetId
        );
        if (exists) {
            console.log('Connection already exists');
            return null;
        }
        
        // If sides not specified, calculate best sides based on positions
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
        
        console.log('Created connection:', connection);
        return connection.id;
    }
    
    // Calculate best exit/entry sides based on element positions
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
            // Horizontal dominant
            if (dx > 0) {
                sourceSide = 'right';
                targetSide = 'left';
            } else {
                sourceSide = 'left';
                targetSide = 'right';
            }
        } else {
            // Vertical dominant
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
    
    deleteElement(elementId) {
        this.elements = this.elements.filter(el => el.id !== elementId);
        // Also delete any connections to/from this element
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
                hasUnsavedChanges: true
            }
        }));
    }
}
