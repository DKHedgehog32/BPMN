/**
 * @description Main orchestrating component for the Process Modeling Studio
 * @author Dennis van Musschenbroek (DvM) - Cobra CRM B.V.
 * @date 2024-12-14
 * @version 1.1.0
 * 
 * EXPLANATION:
 * This is the main container component that orchestrates all child components:
 * - processToolbar: Top action bar
 * - processPalette: Left side element palette
 * - processCanvas: Center SVG canvas
 * - processProperties: Right side properties panel
 * 
 * It handles:
 * - Loading process data from Apex
 * - Creating new processes when no ID provided
 * - Saving canvas state
 * - Publishing versions
 * - Auto-save functionality
 * - Communication between child components
 * - Process Quality Score propagation to properties panel
 * 
 * DEPENDENCIES:
 * - ProcessCanvasController (Apex)
 * - processToolbar, processPalette, processCanvas, processProperties (LWC)
 * 
 * CHANGELOG:
 * Version | Date       | Author | Description
 * --------|------------|--------|------------------------------------------
 * 1.0.0   | 2024-12-12 | DvM    | Initial creation - main orchestration
 * 1.0.1   | 2024-12-12 | DvM    | Support creating new process without ID
 * 1.1.0   | 2024-12-14 | DvM    | Added Process Quality Score integration
 *                                 - Added scoreData tracked property
 *                                 - Updated handleCanvasChange to extract score
 *                                 - Calculate initial score on canvas load
 * 
 * SECURITY:
 * - All data operations via Apex with FLS enforcement
 * 
 * USAGE:
 * <c-process-modeler process-id={recordId}></c-process-modeler>
 * OR for new process:
 * <c-process-modeler></c-process-modeler>
 */
import { LightningElement, api, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { CurrentPageReference, NavigationMixin } from 'lightning/navigation';

// Apex methods
import loadProcess from '@salesforce/apex/ProcessCanvasController.loadProcess';
import saveProcess from '@salesforce/apex/ProcessCanvasController.saveProcess';
import publishProcess from '@salesforce/apex/ProcessCanvasController.publishProcess';
import autoSave from '@salesforce/apex/ProcessCanvasController.autoSave';
import createProcess from '@salesforce/apex/ProcessCanvasController.createProcess';

export default class ProcessModeler extends NavigationMixin(LightningElement) {
    
    // =========================================================================
    // PUBLIC API
    // =========================================================================
    
    @api recordId; // From record page
    @api processId; // From app page property
    
    // =========================================================================
    // TRACKED STATE
    // =========================================================================
    
    @track processData = null;
    @track isLoading = true;
    @track isSaving = false;
    @track hasUnsavedChanges = false;
    @track selectedElement = null;
    @track selectedConnection = null;
    @track zoomLevel = 100;
    @track error = null;
    @track isNewProcess = false;
    @track showNewProcessModal = false;
    @track newProcessName = '';
    @track newProcessDescription = '';
    @track scoreData = null; // Process Quality Score data
    
    // Auto-save timer
    autoSaveTimer = null;
    autoSaveInterval = 30000; // 30 seconds
    
    // =========================================================================
    // WIRES
    // =========================================================================
    
    @wire(CurrentPageReference)
    pageRef;
    
    // =========================================================================
    // LIFECYCLE
    // =========================================================================
    
    connectedCallback() {
        this.loadProcessData();
        this.setupKeyboardShortcuts();
        this.setupResizeHandler();
    }
    
    disconnectedCallback() {
        this.clearAutoSave();
        this.removeKeyboardShortcuts();
        this.removeResizeHandler();
    }
    
    renderedCallback() {
        // Calculate and set height on first render
        if (!this._heightInitialized) {
            this._heightInitialized = true;
            this.calculateHeight();
        }
    }
    
    // =========================================================================
    // DYNAMIC HEIGHT CALCULATION
    // =========================================================================
    
    setupResizeHandler() {
        this._resizeHandler = this.calculateHeight.bind(this);
        window.addEventListener('resize', this._resizeHandler);
    }
    
    removeResizeHandler() {
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
        }
    }
    
    calculateHeight() {
        // Get the host element
        const hostElement = this.template.host;
        if (!hostElement) return;
        
        // Get the position of this component relative to viewport
        const rect = hostElement.getBoundingClientRect();
        
        // Calculate available height: viewport height minus the top position
        const availableHeight = window.innerHeight - rect.top;
        
        // Set the height directly on the host element
        hostElement.style.height = `${availableHeight}px`;
    }
    
    // =========================================================================
    // GETTERS
    // =========================================================================
    
    get effectiveProcessId() {
        return this.recordId || this.processId;
    }
    
    get processName() {
        if (this.isNewProcess) return 'New Process';
        return this.processData?.name || 'Loading...';
    }
    
    get processStatus() {
        if (this.isNewProcess) return 'Draft';
        return this.processData?.status || 'Draft';
    }
    
    get currentVersion() {
        if (this.isNewProcess) return 1;
        return this.processData?.currentVersion || 1;
    }
    
    get isReadOnly() {
        if (this.isNewProcess) return false;
        return !this.processData?.isEditable;
    }
    
    get showError() {
        return !!this.error && !this.isNewProcess;
    }
    
    get showCanvas() {
        return !this.isLoading && (this.processData || this.isNewProcess);
    }
    
    get containerClass() {
        return `modeler-container ${this.isLoading ? 'loading' : ''}`;
    }
    
    get saveButtonDisabled() {
        return this.isSaving || (!this.hasUnsavedChanges && !this.isNewProcess) || this.isReadOnly;
    }
    
    // =========================================================================
    // DATA LOADING
    // =========================================================================
    
    async loadProcessData() {
        // If no process ID, show new process mode
        if (!this.effectiveProcessId) {
            this.isNewProcess = true;
            this.isLoading = false;
            this.hasUnsavedChanges = true;
            // Don't set up auto-save until process is created
            return;
        }
        
        this.isLoading = true;
        this.error = null;
        this.isNewProcess = false;
        
        try {
            this.processData = await loadProcess({ processId: this.effectiveProcessId });
            
            // Load canvas state after component renders
            setTimeout(() => {
                this.initializeCanvas();
            }, 100);
            
            // Set up auto-save for existing processes
            this.setupAutoSave();
            
        } catch (error) {
            console.error('Error loading process:', error);
            this.error = this.parseError(error);
            this.showToast('Error', this.error, 'error');
        } finally {
            this.isLoading = false;
        }
    }
    
    initializeCanvas() {
        const canvas = this.template.querySelector('c-process-canvas');
        if (canvas && this.processData?.canvasJson) {
            canvas.setCanvasState(this.processData.canvasJson);
            
            // Calculate initial score after canvas is loaded
            setTimeout(() => {
                this.calculateInitialScore();
            }, 100);
        }
    }
    
    /**
     * @description Calculate initial process score after canvas loads
     * This ensures the score panel shows data even before user makes changes
     */
    calculateInitialScore() {
        const canvas = this.template.querySelector('c-process-canvas');
        if (canvas && typeof canvas.calculateProcessScore === 'function') {
            this.scoreData = canvas.calculateProcessScore();
        }
    }
    
    // =========================================================================
    // SAVING
    // =========================================================================
    
    async handleSave() {
        // For new process, prompt for name first
        if (this.isNewProcess) {
            this.showNewProcessModal = true;
            return;
        }
        
        await this.performSave();
    }
    
    async performSave() {
        if (this.isSaving || this.isReadOnly) return;
        
        this.isSaving = true;
        
        try {
            const canvas = this.template.querySelector('c-process-canvas');
            const canvasJson = canvas ? canvas.getCanvasState() : '{}';
            
            const result = await saveProcess({
                processId: this.effectiveProcessId,
                canvasJson: canvasJson,
                viewBoxSettings: null
            });
            
            this.hasUnsavedChanges = false;
            this.processData = { ...this.processData, ...result };
            
            this.showToast('Success', 'Process saved successfully', 'success');
            
        } catch (error) {
            console.error('Error saving process:', error);
            this.showToast('Error', this.parseError(error), 'error');
        } finally {
            this.isSaving = false;
        }
    }
    
    // =========================================================================
    // NEW PROCESS CREATION
    // =========================================================================
    
    handleNewProcessNameChange(event) {
        this.newProcessName = event.target.value;
    }
    
    handleNewProcessDescChange(event) {
        this.newProcessDescription = event.target.value;
    }
    
    handleCancelNewProcess() {
        this.showNewProcessModal = false;
    }
    
    async handleCreateProcess() {
        if (!this.newProcessName || !this.newProcessName.trim()) {
            this.showToast('Error', 'Please enter a process name', 'error');
            return;
        }
        
        this.showNewProcessModal = false;
        this.isSaving = true;
        
        try {
            const canvas = this.template.querySelector('c-process-canvas');
            const canvasJson = canvas ? canvas.getCanvasState() : '{}';
            
            const result = await createProcess({
                name: this.newProcessName.trim(),
                description: this.newProcessDescription,
                canvasJson: canvasJson
            });
            
            // Update state with new process
            this.processData = result;
            this.isNewProcess = false;
            this.hasUnsavedChanges = false;
            this.processId = result.id;
            
            // Set up auto-save now that process exists
            this.setupAutoSave();
            
            this.showToast('Success', 'Process created successfully', 'success');
            
            // Navigate to the new record (optional)
            // this.navigateToRecord(result.id);
            
        } catch (error) {
            console.error('Error creating process:', error);
            this.showToast('Error', this.parseError(error), 'error');
        } finally {
            this.isSaving = false;
        }
    }
    
    // =========================================================================
    // PUBLISHING
    // =========================================================================
    
    async handlePublish(event) {
        const { changeNotes } = event.detail;
        
        if (this.isNewProcess) {
            this.showToast('Info', 'Please save the process first', 'info');
            return;
        }
        
        this.isSaving = true;
        
        try {
            // First save any pending changes
            const canvas = this.template.querySelector('c-process-canvas');
            const canvasJson = canvas ? canvas.getCanvasState() : '{}';
            
            const result = await publishProcess({
                processId: this.effectiveProcessId,
                canvasJson: canvasJson,
                changeNotes: changeNotes
            });
            
            this.processData = { ...this.processData, ...result };
            this.hasUnsavedChanges = false;
            
            this.showToast('Success', `Version ${result.currentVersion} published successfully`, 'success');
            
        } catch (error) {
            console.error('Error publishing process:', error);
            this.showToast('Error', this.parseError(error), 'error');
        } finally {
            this.isSaving = false;
        }
    }
    
    // =========================================================================
    // AUTO-SAVE
    // =========================================================================
    
    setupAutoSave() {
        if (this.autoSaveTimer) return; // Already set up
        
        this.autoSaveTimer = setInterval(() => {
            if (this.hasUnsavedChanges && !this.isSaving && !this.isReadOnly && !this.isNewProcess && this.effectiveProcessId) {
                this.performAutoSave();
            }
        }, this.autoSaveInterval);
    }
    
    async performAutoSave() {
        try {
            const canvas = this.template.querySelector('c-process-canvas');
            const canvasJson = canvas ? canvas.getCanvasState() : '{}';
            
            await autoSave({
                processId: this.effectiveProcessId,
                canvasJson: canvasJson
            });
            
            this.hasUnsavedChanges = false;
            
        } catch (error) {
            console.error('Auto-save failed:', error);
            // Don't show toast for auto-save failures to avoid spamming
        }
    }
    
    clearAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }
    
    // =========================================================================
    // KEYBOARD SHORTCUTS
    // =========================================================================
    
    setupKeyboardShortcuts() {
        this._keyHandler = this.handleKeyDown.bind(this);
        window.addEventListener('keydown', this._keyHandler);
    }
    
    removeKeyboardShortcuts() {
        if (this._keyHandler) {
            window.removeEventListener('keydown', this._keyHandler);
        }
    }
    
    handleKeyDown(event) {
        // Ctrl+S or Cmd+S - Save
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
            event.preventDefault();
            this.handleSave();
        }
        
        // Ctrl+Z or Cmd+Z - Undo
        if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
            event.preventDefault();
            this.handleUndo();
        }
        
        // Ctrl+Y or Cmd+Shift+Z - Redo
        if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
            event.preventDefault();
            this.handleRedo();
        }
    }
    
    // =========================================================================
    // CANVAS EVENT HANDLERS
    // =========================================================================
    
    /**
     * @description Handle canvas change events
     * Updates dirty flag and extracts process quality score
     */
    handleCanvasChange(event) {
        this.hasUnsavedChanges = true;
        
        // Extract score data from canvas change event
        if (event.detail?.score) {
            this.scoreData = event.detail.score;
        }
    }
    
    handleSelectionChange(event) {
        const { type, element, connection } = event.detail;
        
        if (type === 'element') {
            this.selectedElement = element;
            this.selectedConnection = null;
        } else if (type === 'connection') {
            this.selectedConnection = connection;
            this.selectedElement = null;
        } else {
            this.selectedElement = null;
            this.selectedConnection = null;
        }
    }
    
    // =========================================================================
    // PROPERTIES PANEL HANDLERS
    // =========================================================================
    
    handlePropertyChange(event) {
        const { property, value } = event.detail;
        
        const canvas = this.template.querySelector('c-process-canvas');
        if (canvas && this.selectedElement) {
            canvas.updateSelectedElement({ [property]: value });
            this.hasUnsavedChanges = true;
        }
    }
    
    handleDeleteElement() {
        const canvas = this.template.querySelector('c-process-canvas');
        if (canvas) {
            canvas.deleteSelected();
        }
    }
    
    handleDeleteConnection() {
        const canvas = this.template.querySelector('c-process-canvas');
        if (canvas) {
            canvas.deleteSelected();
        }
    }
    
    // =========================================================================
    // TOOLBAR HANDLERS
    // =========================================================================
    
    handleZoomIn() {
        const canvas = this.template.querySelector('c-process-canvas');
        if (canvas) {
            canvas.zoomIn();
            this.zoomLevel = Math.min(this.zoomLevel * 1.2, 300);
        }
    }
    
    handleZoomOut() {
        const canvas = this.template.querySelector('c-process-canvas');
        if (canvas) {
            canvas.zoomOut();
            this.zoomLevel = Math.max(this.zoomLevel / 1.2, 30);
        }
    }
    
    handleZoomFit() {
        const canvas = this.template.querySelector('c-process-canvas');
        if (canvas) {
            canvas.zoomFit();
            this.zoomLevel = 100;
        }
    }
    
    handleZoomReset() {
        this.zoomLevel = 100;
    }
    
    handleToggleGrid(event) {
        // TODO: Implement grid toggle
    }
    
    handleToggleSnap(event) {
        // TODO: Implement snap toggle
    }
    
    handleUndo() {
        // TODO: Implement undo
        this.showToast('Info', 'Undo feature coming soon', 'info');
    }
    
    handleRedo() {
        // TODO: Implement redo
        this.showToast('Info', 'Redo feature coming soon', 'info');
    }
    
    handleDeleteSelected() {
        const canvas = this.template.querySelector('c-process-canvas');
        if (canvas) {
            canvas.deleteSelected();
        }
    }
    
    handleClone() {
        // TODO: Implement clone
        this.showToast('Info', 'Clone feature coming soon', 'info');
    }
    
    handleExport() {
        // TODO: Implement export
        this.showToast('Info', 'Export feature coming soon', 'info');
    }
    
    handleVersionHistory() {
        // TODO: Implement version history
        this.showToast('Info', 'Version history feature coming soon', 'info');
    }
    
    // =========================================================================
    // UTILITY METHODS
    // =========================================================================
    
    parseError(error) {
        if (typeof error === 'string') return error;
        if (error.body?.message) return error.body.message;
        if (error.message) return error.message;
        return 'An unknown error occurred';
    }
    
    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({
            title,
            message,
            variant
        }));
    }
    
    navigateToRecord(recordId) {
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId: recordId,
                objectApiName: 'Process__c',
                actionName: 'view'
            }
        });
    }
}