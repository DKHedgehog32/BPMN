/**
 * @description POC component to validate SVG canvas functionality in Lightning Web Components
 * @author Dennis van Musschenbroek (DvM) - Cobra CRM B.V.
 * @date 2024-12-10
 * @version 1.0.1
 * 
 * EXPLANATION:
 * This Proof of Concept validates that we can build a BPMN process modeling canvas
 * in Salesforce Lightning. It tests critical functionality:
 * - SVG rendering within LWC (Locker Service compatibility)
 * - Mouse event handling (mousedown, mousemove, mouseup)
 * - Drag and drop of SVG elements
 * - Pan and zoom of the canvas viewport
 * - Dynamic shape creation and connections
 * 
 * IMPORTANT: This uses programmatic SVG manipulation instead of template iteration
 * because LWC has limitations with dynamic SVG content in templates.
 * 
 * DEPENDENCIES:
 * - None (standalone POC with no Apex or external dependencies)
 * 
 * CHANGELOG:
 * Version | Date       | Author | Description
 * --------|------------|--------|------------------------------------------
 * 1.0.0   | 2024-12-10 | DvM    | Initial POC - canvas with drag/drop shapes
 * 1.0.1   | 2024-12-10 | DvM    | Fixed LWC syntax - programmatic SVG manipulation
 * 
 * SECURITY:
 * - No data persistence (all in-memory)
 * - No Apex calls
 * - Locker Service compatible SVG operations
 * 
 * USAGE:
 * <c-bpmn-canvas-poc></c-bpmn-canvas-poc>
 */

import { LightningElement, track } from 'lwc';

// SVG Namespace for creating SVG elements
const SVG_NS = 'http://www.w3.org/2000/svg';

export default class BpmnCanvasPoc extends LightningElement {
    // ========================================================================
    // TRACKED PROPERTIES
    // ========================================================================
    
    @track shapes = [];           // Array of shape objects on canvas
    @track connections = [];      // Array of connection objects
    @track selectedShapeId = null;// ID of currently selected shape
    @track testResults = [];      // POC validation results
    
    // Canvas state
    @track viewBox = { x: 0, y: 0, width: 1000, height: 600 };
    @track zoom = 1;
    @track currentMode = 'select'; // 'select', 'pan', 'connect'
    
    // ========================================================================
    // PRIVATE PROPERTIES
    // ========================================================================
    
    isDragging = false;
    isPanning = false;
    isDrawingConnection = false;
    dragOffset = { x: 0, y: 0 };
    dragShapeId = null;
    panStart = { x: 0, y: 0 };
    connectionSourceId = null;
    shapeCounter = 0;
    connectionCounter = 0;
    isRendered = false;
    
    // ========================================================================
    // LIFECYCLE HOOKS
    // ========================================================================
    
    connectedCallback() {
        // Initialize test results tracking
        this.initializeTestResults();
    }
    
    renderedCallback() {
        if (!this.isRendered) {
            this.isRendered = true;
            
            // Set marker refX and refY attributes programmatically
            // LWC doesn't allow these attributes in the template
            const marker = this.template.querySelector('#arrowhead');
            if (marker) {
                marker.setAttribute('refX', '9');
                marker.setAttribute('refY', '3.5');
            }
            
            // Update SVG viewBox after initial render
            this.updateCanvasViewBox();
            
            // Mark SVG rendering test as passed if canvas exists
            const canvas = this.template.querySelector('.bpmn-canvas');
            if (canvas) {
                this.updateTestResult('svgRender', true, 'SVG canvas renders correctly in LWC');
            }
        }
    }
    
    // ========================================================================
    // COMPUTED PROPERTIES - MODE BUTTON VARIANTS
    // ========================================================================
    
    get selectModeVariant() {
        return this.currentMode === 'select' ? 'brand' : 'neutral';
    }
    
    get panModeVariant() {
        return this.currentMode === 'pan' ? 'brand' : 'neutral';
    }
    
    get connectModeVariant() {
        return this.currentMode === 'connect' ? 'brand' : 'neutral';
    }
    
    // ========================================================================
    // COMPUTED PROPERTIES - STATISTICS
    // ========================================================================
    
    get zoomPercentage() {
        return Math.round(this.zoom * 100);
    }
    
    get shapeCount() {
        return this.shapes.length;
    }
    
    get connectionCount() {
        return this.connections.length;
    }
    
    // ========================================================================
    // COMPUTED PROPERTIES - SELECTED SHAPE
    // ========================================================================
    
    get hasSelectedShape() {
        return this.selectedShapeId !== null;
    }
    
    get selectedShapeLabel() {
        const shape = this.shapes.find(s => s.id === this.selectedShapeId);
        return shape ? shape.label : '';
    }
    
    // ========================================================================
    // COMPUTED PROPERTIES - POC SUMMARY
    // ========================================================================
    
    get pocSummaryClass() {
        return 'slds-p-around_medium slds-text-align_center poc-summary';
    }
    
    get pocResultClass() {
        const passedCount = this.testResults.filter(t => t.passed).length;
        const totalCount = this.testResults.length;
        
        if (passedCount === totalCount) {
            return 'poc-result poc-go';
        } else if (passedCount === 0) {
            return 'poc-result poc-testing';
        }
        return 'poc-result poc-testing';
    }
    
    get pocResultText() {
        const passedCount = this.testResults.filter(t => t.passed).length;
        const totalCount = this.testResults.length;
        
        if (passedCount === totalCount) {
            return '✅ GO - All Tests Passed!';
        }
        return `Testing... ${passedCount}/${totalCount}`;
    }
    
    get pocMessage() {
        const passedCount = this.testResults.filter(t => t.passed).length;
        const totalCount = this.testResults.length;
        
        if (passedCount === totalCount) {
            return 'The SVG canvas approach works in LWC. Proceed with full development!';
        }
        return 'Complete all interactions to validate the technical approach.';
    }
    
    // ========================================================================
    // TOOLBAR HANDLERS - SHAPE CREATION
    // ========================================================================
    
    handleAddStartEvent() {
        this.addShape('startEvent', 'Start', 100 + (this.shapes.length * 30), 100);
        this.updateTestResult('createShape', true, 'Shapes can be created dynamically');
    }
    
    handleAddTask() {
        this.addShape('task', 'Task ' + (this.shapeCounter + 1), 200 + (this.shapes.length * 30), 150);
        this.updateTestResult('createShape', true, 'Shapes can be created dynamically');
    }
    
    handleAddGateway() {
        this.addShape('gateway', 'Decision', 350 + (this.shapes.length * 30), 100);
        this.updateTestResult('createShape', true, 'Shapes can be created dynamically');
    }
    
    handleAddEndEvent() {
        this.addShape('endEvent', 'End', 500 + (this.shapes.length * 30), 100);
        this.updateTestResult('createShape', true, 'Shapes can be created dynamically');
    }
    
    // ========================================================================
    // TOOLBAR HANDLERS - MODE SELECTION
    // ========================================================================
    
    handleSelectMode() {
        this.currentMode = 'select';
        this.cancelConnectionDrawing();
    }
    
    handlePanMode() {
        this.currentMode = 'pan';
        this.cancelConnectionDrawing();
        this.deselectAll();
    }
    
    handleConnectMode() {
        this.currentMode = 'connect';
        this.deselectAll();
    }
    
    // ========================================================================
    // TOOLBAR HANDLERS - ACTIONS
    // ========================================================================
    
    handleResetView() {
        this.zoom = 1;
        this.viewBox = { x: 0, y: 0, width: 1000, height: 600 };
        this.updateCanvasViewBox();
    }
    
    handleClearAll() {
        this.shapes = [];
        this.connections = [];
        this.selectedShapeId = null;
        this.shapeCounter = 0;
        this.connectionCounter = 0;
        this.renderAllShapes();
        this.renderAllConnections();
    }
    
    // ========================================================================
    // CANVAS EVENT HANDLERS
    // ========================================================================
    
    handleCanvasMouseDown(event) {
        const point = this.getCanvasPoint(event);
        const shapeElement = this.findShapeElement(event.target);
        
        this.updateTestResult('mouseEvents', true, 'Mouse events work correctly');
        
        if (shapeElement) {
            const shapeId = shapeElement.dataset.shapeId;
            
            if (this.currentMode === 'select') {
                this.selectShape(shapeId);
                this.startDragging(shapeId, point);
                this.updateTestResult('selectShape', true, 'Shapes can be selected via click');
                
            } else if (this.currentMode === 'connect') {
                if (!this.isDrawingConnection) {
                    this.startConnection(shapeId, point);
                } else {
                    this.completeConnection(shapeId);
                }
            }
        } else {
            if (this.currentMode === 'pan') {
                this.startPanning(event);
            } else if (this.currentMode === 'connect' && this.isDrawingConnection) {
                this.cancelConnectionDrawing();
            } else {
                this.deselectAll();
            }
        }
    }
    
    handleCanvasMouseMove(event) {
        const point = this.getCanvasPoint(event);
        
        if (this.isDragging && this.dragShapeId) {
            this.moveShape(this.dragShapeId, point);
            this.updateTestResult('dragShape', true, 'Shapes can be dragged to new positions');
            
        } else if (this.isPanning) {
            this.panCanvas(event);
            this.updateTestResult('panCanvas', true, 'Canvas can be panned');
            
        } else if (this.isDrawingConnection) {
            this.updateTempConnection(point);
        }
    }
    
    handleCanvasMouseUp() {
        if (this.isDragging) {
            this.stopDragging();
        }
        if (this.isPanning) {
            this.stopPanning();
        }
    }
    
    handleCanvasWheel(event) {
        event.preventDefault();
        
        const delta = event.deltaY > 0 ? -0.1 : 0.1;
        const newZoom = Math.min(Math.max(this.zoom + delta, 0.25), 3);
        
        if (newZoom !== this.zoom) {
            this.zoom = newZoom;
            this.updateCanvasViewBox();
            this.updateTestResult('zoomCanvas', true, 'Canvas zoom works via mouse wheel');
        }
    }
    
    // ========================================================================
    // PROPERTIES PANEL HANDLERS
    // ========================================================================
    
    handleLabelChange(event) {
        if (this.selectedShapeId) {
            const newLabel = event.target.value;
            const shapeIndex = this.shapes.findIndex(s => s.id === this.selectedShapeId);
            if (shapeIndex !== -1) {
                this.shapes[shapeIndex] = { ...this.shapes[shapeIndex], label: newLabel };
                this.renderAllShapes();
            }
        }
    }
    
    handleDeleteSelected() {
        if (this.selectedShapeId) {
            const shapeId = this.selectedShapeId;
            
            this.shapes = this.shapes.filter(s => s.id !== shapeId);
            this.connections = this.connections.filter(c => 
                c.sourceId !== shapeId && c.targetId !== shapeId
            );
            
            this.selectedShapeId = null;
            this.renderAllShapes();
            this.renderAllConnections();
            this.updateTestResult('deleteShape', true, 'Shapes can be deleted');
        }
    }
    
    // ========================================================================
    // SHAPE MANAGEMENT
    // ========================================================================
    
    addShape(type, label, x, y) {
        const id = 'shape_' + (++this.shapeCounter);
        
        let width, height;
        switch(type) {
            case 'startEvent':
            case 'endEvent':
                width = 50;
                height = 50;
                break;
            case 'task':
                width = 120;
                height = 60;
                break;
            case 'gateway':
                width = 60;
                height = 60;
                break;
            default:
                width = 50;
                height = 50;
        }
        
        const shape = { id, type, label, x, y, width, height };
        this.shapes = [...this.shapes, shape];
        this.renderAllShapes();
    }
    
    selectShape(shapeId) {
        this.selectedShapeId = shapeId;
        this.renderAllShapes();
    }
    
    deselectAll() {
        this.selectedShapeId = null;
        this.renderAllShapes();
    }
    
    startDragging(shapeId, point) {
        const shape = this.shapes.find(s => s.id === shapeId);
        if (shape) {
            this.isDragging = true;
            this.dragShapeId = shapeId;
            this.dragOffset = {
                x: point.x - shape.x,
                y: point.y - shape.y
            };
        }
    }
    
    moveShape(shapeId, point) {
        const newX = point.x - this.dragOffset.x;
        const newY = point.y - this.dragOffset.y;
        
        const shapeIndex = this.shapes.findIndex(s => s.id === shapeId);
        if (shapeIndex !== -1) {
            this.shapes[shapeIndex] = { ...this.shapes[shapeIndex], x: newX, y: newY };
            this.renderAllShapes();
            this.renderAllConnections();
        }
    }
    
    stopDragging() {
        this.isDragging = false;
        this.dragShapeId = null;
    }
    
    // ========================================================================
    // CONNECTION MANAGEMENT
    // ========================================================================
    
    startConnection(shapeId, point) {
        const shape = this.shapes.find(s => s.id === shapeId);
        if (shape) {
            this.isDrawingConnection = true;
            this.connectionSourceId = shapeId;
            
            const centerX = shape.x + shape.width / 2;
            const centerY = shape.y + shape.height / 2;
            
            const tempLine = this.template.querySelector('.temp-connection');
            if (tempLine) {
                tempLine.setAttribute('x1', centerX);
                tempLine.setAttribute('y1', centerY);
                tempLine.setAttribute('x2', point.x);
                tempLine.setAttribute('y2', point.y);
                tempLine.style.display = 'block';
            }
        }
    }
    
    updateTempConnection(point) {
        const tempLine = this.template.querySelector('.temp-connection');
        if (tempLine) {
            tempLine.setAttribute('x2', point.x);
            tempLine.setAttribute('y2', point.y);
        }
    }
    
    completeConnection(targetId) {
        if (this.connectionSourceId && targetId !== this.connectionSourceId) {
            // Check if connection already exists
            const exists = this.connections.some(c => 
                c.sourceId === this.connectionSourceId && c.targetId === targetId
            );
            
            if (!exists) {
                const id = 'conn_' + (++this.connectionCounter);
                const connection = {
                    id,
                    sourceId: this.connectionSourceId,
                    targetId
                };
                
                this.connections = [...this.connections, connection];
                this.renderAllConnections();
                this.updateTestResult('createConnection', true, 'Connections can be drawn between shapes');
            }
        }
        
        this.cancelConnectionDrawing();
    }
    
    cancelConnectionDrawing() {
        this.isDrawingConnection = false;
        this.connectionSourceId = null;
        
        const tempLine = this.template.querySelector('.temp-connection');
        if (tempLine) {
            tempLine.style.display = 'none';
        }
    }
    
    // ========================================================================
    // SVG RENDERING - Programmatic manipulation
    // ========================================================================
    
    renderAllShapes() {
        const shapesLayer = this.template.querySelector('.shapes-layer');
        if (!shapesLayer) return;
        
        // Clear existing shapes
        shapesLayer.innerHTML = '';
        
        // Render each shape
        this.shapes.forEach(shape => {
            const group = this.createShapeGroup(shape);
            shapesLayer.appendChild(group);
        });
    }
    
    createShapeGroup(shape) {
        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', 'shape-group' + (shape.id === this.selectedShapeId ? ' selected' : ''));
        g.setAttribute('data-shape-id', shape.id);
        g.setAttribute('transform', `translate(${shape.x}, ${shape.y})`);
        
        const isSelected = shape.id === this.selectedShapeId;
        const stroke = isSelected ? '#0176d3' : '#333';
        const strokeWidth = isSelected ? 3 : 2;
        
        let shapeEl;
        
        switch(shape.type) {
            case 'startEvent':
                shapeEl = document.createElementNS(SVG_NS, 'circle');
                shapeEl.setAttribute('cx', '25');
                shapeEl.setAttribute('cy', '25');
                shapeEl.setAttribute('r', '25');
                shapeEl.setAttribute('fill', '#d4edda');
                shapeEl.setAttribute('stroke', stroke);
                shapeEl.setAttribute('stroke-width', strokeWidth);
                break;
                
            case 'endEvent':
                shapeEl = document.createElementNS(SVG_NS, 'circle');
                shapeEl.setAttribute('cx', '25');
                shapeEl.setAttribute('cy', '25');
                shapeEl.setAttribute('r', '25');
                shapeEl.setAttribute('fill', '#f8d7da');
                shapeEl.setAttribute('stroke', stroke);
                shapeEl.setAttribute('stroke-width', '4');
                break;
                
            case 'task':
                shapeEl = document.createElementNS(SVG_NS, 'rect');
                shapeEl.setAttribute('width', '120');
                shapeEl.setAttribute('height', '60');
                shapeEl.setAttribute('rx', '8');
                shapeEl.setAttribute('fill', '#cce5ff');
                shapeEl.setAttribute('stroke', stroke);
                shapeEl.setAttribute('stroke-width', strokeWidth);
                break;
                
            case 'gateway':
                shapeEl = document.createElementNS(SVG_NS, 'polygon');
                shapeEl.setAttribute('points', '30,0 60,30 30,60 0,30');
                shapeEl.setAttribute('fill', '#fff3cd');
                shapeEl.setAttribute('stroke', stroke);
                shapeEl.setAttribute('stroke-width', strokeWidth);
                
                // Add X symbol for exclusive gateway
                const xSymbol = document.createElementNS(SVG_NS, 'text');
                xSymbol.setAttribute('x', '30');
                xSymbol.setAttribute('y', '36');
                xSymbol.setAttribute('text-anchor', 'middle');
                xSymbol.setAttribute('font-size', '20');
                xSymbol.setAttribute('font-weight', 'bold');
                xSymbol.setAttribute('fill', '#856404');
                xSymbol.textContent = 'X';
                g.appendChild(xSymbol);
                break;
        }
        
        shapeEl.setAttribute('class', 'shape-body');
        g.appendChild(shapeEl);
        
        // Add label
        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('class', 'shape-label');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', '#333');
        text.setAttribute('font-size', '12');
        text.textContent = shape.label;
        
        switch(shape.type) {
            case 'startEvent':
            case 'endEvent':
                text.setAttribute('x', '25');
                text.setAttribute('y', '65');
                break;
            case 'task':
                text.setAttribute('x', '60');
                text.setAttribute('y', '35');
                break;
            case 'gateway':
                text.setAttribute('x', '30');
                text.setAttribute('y', '80');
                break;
        }
        
        g.appendChild(text);
        
        // Add connection anchors
        const anchors = this.getAnchorOffsets(shape.type);
        anchors.forEach(anchor => {
            const circle = document.createElementNS(SVG_NS, 'circle');
            circle.setAttribute('class', 'anchor');
            circle.setAttribute('cx', anchor.x);
            circle.setAttribute('cy', anchor.y);
            circle.setAttribute('r', '5');
            circle.setAttribute('fill', '#0176d3');
            g.appendChild(circle);
        });
        
        return g;
    }
    
    getAnchorOffsets(type) {
        switch(type) {
            case 'startEvent':
            case 'endEvent':
                return [
                    { x: 25, y: 0 },    // top
                    { x: 50, y: 25 },   // right
                    { x: 25, y: 50 },   // bottom
                    { x: 0, y: 25 }     // left
                ];
            case 'task':
                return [
                    { x: 60, y: 0 },    // top
                    { x: 120, y: 30 },  // right
                    { x: 60, y: 60 },   // bottom
                    { x: 0, y: 30 }     // left
                ];
            case 'gateway':
                return [
                    { x: 30, y: 0 },    // top
                    { x: 60, y: 30 },   // right
                    { x: 30, y: 60 },   // bottom
                    { x: 0, y: 30 }     // left
                ];
            default:
                return [];
        }
    }
    
    renderAllConnections() {
        const connectionsLayer = this.template.querySelector('.connections-layer');
        if (!connectionsLayer) return;
        
        // Clear existing connections
        connectionsLayer.innerHTML = '';
        
        // Render each connection
        this.connections.forEach(conn => {
            const source = this.shapes.find(s => s.id === conn.sourceId);
            const target = this.shapes.find(s => s.id === conn.targetId);
            
            if (source && target) {
                const pathData = this.calculateConnectionPath(source, target);
                
                const g = document.createElementNS(SVG_NS, 'g');
                g.setAttribute('class', 'connection');
                g.setAttribute('data-connection-id', conn.id);
                
                const path = document.createElementNS(SVG_NS, 'path');
                path.setAttribute('class', 'connection-path');
                path.setAttribute('d', pathData);
                path.setAttribute('stroke', '#333');
                path.setAttribute('stroke-width', '2');
                path.setAttribute('fill', 'none');
                path.setAttribute('marker-end', 'url(#arrowhead)');
                
                g.appendChild(path);
                connectionsLayer.appendChild(g);
            }
        });
    }
    
    calculateConnectionPath(source, target) {
        const sx = source.x + source.width / 2;
        const sy = source.y + source.height / 2;
        const tx = target.x + target.width / 2;
        const ty = target.y + target.height / 2;
        
        const dx = tx - sx;
        const dy = ty - sy;
        
        let startX, startY, endX, endY;
        
        // Determine connection direction based on relative positions
        if (Math.abs(dx) > Math.abs(dy)) {
            // Primarily horizontal
            if (dx > 0) {
                startX = source.x + source.width;
                startY = source.y + source.height / 2;
                endX = target.x;
                endY = target.y + target.height / 2;
            } else {
                startX = source.x;
                startY = source.y + source.height / 2;
                endX = target.x + target.width;
                endY = target.y + target.height / 2;
            }
            
            const midX = (startX + endX) / 2;
            return `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
        } else {
            // Primarily vertical
            if (dy > 0) {
                startX = source.x + source.width / 2;
                startY = source.y + source.height;
                endX = target.x + target.width / 2;
                endY = target.y;
            } else {
                startX = source.x + source.width / 2;
                startY = source.y;
                endX = target.x + target.width / 2;
                endY = target.y + target.height;
            }
            
            const midY = (startY + endY) / 2;
            return `M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`;
        }
    }
    
    // ========================================================================
    // PANNING
    // ========================================================================
    
    startPanning(event) {
        this.isPanning = true;
        this.panStart = {
            x: event.clientX,
            y: event.clientY,
            viewBoxX: this.viewBox.x,
            viewBoxY: this.viewBox.y
        };
    }
    
    panCanvas(event) {
        const dx = (event.clientX - this.panStart.x) / this.zoom;
        const dy = (event.clientY - this.panStart.y) / this.zoom;
        
        this.viewBox = {
            ...this.viewBox,
            x: this.panStart.viewBoxX - dx,
            y: this.panStart.viewBoxY - dy
        };
        
        this.updateCanvasViewBox();
    }
    
    stopPanning() {
        this.isPanning = false;
    }
    
    // ========================================================================
    // CANVAS UTILITIES
    // ========================================================================
    
    updateCanvasViewBox() {
        const canvas = this.template.querySelector('.bpmn-canvas');
        if (canvas) {
            const width = this.viewBox.width / this.zoom;
            const height = this.viewBox.height / this.zoom;
            canvas.setAttribute('viewBox', 
                `${this.viewBox.x} ${this.viewBox.y} ${width} ${height}`
            );
        }
    }
    
    getCanvasPoint(event) {
        const canvas = this.template.querySelector('.bpmn-canvas');
        if (!canvas) return { x: 0, y: 0 };
        
        const rect = canvas.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * (this.viewBox.width / this.zoom) + this.viewBox.x;
        const y = ((event.clientY - rect.top) / rect.height) * (this.viewBox.height / this.zoom) + this.viewBox.y;
        
        return { x, y };
    }
    
    findShapeElement(target) {
        let element = target;
        while (element && element !== this.template) {
            if (element.classList && element.classList.contains('shape-group')) {
                return element;
            }
            element = element.parentElement;
        }
        return null;
    }
    
    // ========================================================================
    // TEST RESULT TRACKING
    // ========================================================================
    
    initializeTestResults() {
        this.testResults = [
            { id: 'svgRender', text: 'SVG canvas renders in LWC', passed: false, icon: 'utility:clock', className: 'test-item pending' },
            { id: 'mouseEvents', text: 'Mouse events work correctly', passed: false, icon: 'utility:clock', className: 'test-item pending' },
            { id: 'createShape', text: 'Shapes can be created dynamically', passed: false, icon: 'utility:clock', className: 'test-item pending' },
            { id: 'selectShape', text: 'Shapes can be selected via click', passed: false, icon: 'utility:clock', className: 'test-item pending' },
            { id: 'dragShape', text: 'Shapes can be dragged to new positions', passed: false, icon: 'utility:clock', className: 'test-item pending' },
            { id: 'createConnection', text: 'Connections can be drawn between shapes', passed: false, icon: 'utility:clock', className: 'test-item pending' },
            { id: 'panCanvas', text: 'Canvas can be panned', passed: false, icon: 'utility:clock', className: 'test-item pending' },
            { id: 'zoomCanvas', text: 'Canvas zoom works via mouse wheel', passed: false, icon: 'utility:clock', className: 'test-item pending' },
            { id: 'deleteShape', text: 'Shapes can be deleted', passed: false, icon: 'utility:clock', className: 'test-item pending' }
        ];
    }
    
    updateTestResult(testId, passed, text) {
        this.testResults = this.testResults.map(result => {
            if (result.id === testId && !result.passed) {
                return {
                    ...result,
                    passed,
                    text,
                    icon: passed ? 'utility:success' : 'utility:error',
                    className: passed ? 'test-item passed' : 'test-item failed'
                };
            }
            return result;
        });
    }
}