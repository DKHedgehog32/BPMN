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
    @track showImportModal = false; // Import modal visibility
    @track importedFlowInfo = null; // Imported Salesforce Flow metadata
    @track showSuggestionsModal = false; // Suggestions modal visibility
    
    // Import source selection state
    @track importSource = null; // 'xml' or 'org'
    @track xmlFile = null; // Selected XML file
    @track xmlFileName = '';
    @track xmlFileSize = '';
    @track xmlParseError = null;
    @track xmlFlowPreview = null; // Parsed flow preview data
    @track xmlFlowData = null; // Full parsed flow data for import
    @track isDraggingXml = false;
    @track organizeIntoLanesOnImport = false; // Layout option: organize into swimlanes
    
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
    
    // Import modal state getters
    get showImportSourceSelected() {
        return this.importSource !== null;
    }
    
    get showXmlImport() {
        return this.importSource === 'xml';
    }
    
    get showOrgImport() {
        return this.importSource === 'org';
    }
    
    get xmlFileSelected() {
        return !!this.xmlFile;
    }
    
    get xmlImportDisabled() {
        return !this.xmlFlowData;
    }
    
    get xmlUploadAreaClass() {
        let classes = 'xml-upload-area';
        if (this.isDraggingXml) classes += ' xml-upload-area-dragging';
        if (this.xmlFileSelected) classes += ' xml-upload-area-selected';
        return classes;
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
    // SALESFORCE IMPORT HANDLERS
    // =========================================================================
    
    /**
     * @description Open the import modal (shows source selection)
     */
    handleImportFromSalesforce() {
        this.showImportModal = true;
        this.importSource = null; // Reset to show source selection
        this.resetXmlState();
    }
    
    /**
     * @description Close the import modal and reset state
     */
    handleImportModalClose() {
        this.showImportModal = false;
        this.importSource = null;
        this.resetXmlState();
    }
    
    /**
     * @description Go back to source selection from XML or Org import
     */
    handleBackToSourceSelection() {
        this.importSource = null;
        this.resetXmlState();
    }
    
    /**
     * @description Select XML file import
     */
    handleSelectXmlImport() {
        this.importSource = 'xml';
    }
    
    /**
     * @description Select Salesforce Org import
     */
    handleSelectOrgImport() {
        this.importSource = 'org';
    }
    
    /**
     * @description Handle cancel from Org import - go back to source selection
     */
    handleOrgImportCancel() {
        this.importSource = null; // Go back to source selection
    }
    
    // =========================================================================
    // SUGGESTIONS MODAL HANDLERS
    // =========================================================================
    
    /**
     * @description Handle open suggestions event from properties panel
     */
    handleOpenSuggestions() {
        this.showSuggestionsModal = true;
    }
    
    /**
     * @description Close suggestions modal
     */
    handleCloseSuggestionsModal() {
        this.showSuggestionsModal = false;
    }
    
    /**
     * @description Handle suggestion selection (could highlight elements)
     */
    handleSuggestionSelect(event) {
        const { relatedElements } = event.detail;
        if (relatedElements && relatedElements.length > 0) {
            // Could highlight elements on canvas
            console.log('Highlight elements:', relatedElements);
        }
    }
    
    /**
     * @description Reset XML upload state
     */
    resetXmlState() {
        this.xmlFile = null;
        this.xmlFileName = '';
        this.xmlFileSize = '';
        this.xmlParseError = null;
        this.xmlFlowPreview = null;
        this.xmlFlowData = null;
        this.isDraggingXml = false;
        this.organizeIntoLanesOnImport = false;
    }
    
    /**
     * @description Handle toggle for organize into lanes option
     */
    handleOrganizeLanesToggle(event) {
        this.organizeIntoLanesOnImport = event.target.checked;
    }
    
    /**
     * @description Handle drag over for XML file upload
     */
    handleXmlDragOver(event) {
        event.preventDefault();
        event.stopPropagation();
        this.isDraggingXml = true;
    }
    
    /**
     * @description Handle drag leave for XML file upload
     */
    handleXmlDragLeave(event) {
        event.preventDefault();
        event.stopPropagation();
        this.isDraggingXml = false;
    }
    
    /**
     * @description Handle file drop for XML upload
     */
    handleXmlDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        this.isDraggingXml = false;
        
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
            this.processXmlFile(files[0]);
        }
    }
    
    /**
     * @description Handle file selection via browse button
     */
    handleXmlFileSelect(event) {
        const files = event.target.files;
        if (files && files.length > 0) {
            this.processXmlFile(files[0]);
        }
    }
    
    /**
     * @description Remove selected XML file
     */
    handleXmlFileRemove() {
        this.resetXmlState();
    }
    
    /**
     * @description Process the selected XML file
     */
    processXmlFile(file) {
        // Validate file type
        if (!file.name.endsWith('.xml') && !file.name.endsWith('.flow-meta.xml')) {
            this.xmlParseError = 'Please select a valid XML file (.xml or .flow-meta.xml)';
            return;
        }
        
        this.xmlFile = file;
        this.xmlFileName = file.name;
        this.xmlFileSize = this.formatFileSize(file.size);
        this.xmlParseError = null;
        this.xmlFlowPreview = null;
        this.xmlFlowData = null;
        
        // Read and parse the file
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const xmlContent = e.target.result;
                this.parseXmlContent(xmlContent);
            } catch (error) {
                this.xmlParseError = 'Error reading file: ' + error.message;
            }
        };
        reader.onerror = () => {
            this.xmlParseError = 'Error reading file';
        };
        reader.readAsText(file);
    }
    
    /**
     * @description Format file size for display
     */
    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' bytes';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    
    /**
     * @description Parse XML content and extract flow data
     */
    parseXmlContent(xmlContent) {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
            
            // Check for parse errors
            const parseError = xmlDoc.querySelector('parsererror');
            if (parseError) {
                this.xmlParseError = 'Invalid XML format: ' + parseError.textContent.substring(0, 100);
                return;
            }
            
            // Find the Flow element (handle namespace)
            const flowElement = xmlDoc.querySelector('Flow') || xmlDoc.getElementsByTagName('Flow')[0];
            if (!flowElement) {
                this.xmlParseError = 'No Flow element found in XML. Please ensure this is a Salesforce Flow file.';
                return;
            }
            
            // Extract flow metadata
            const flowData = this.extractFlowDataFromXml(flowElement, xmlDoc);
            
            // Store for import
            this.xmlFlowData = flowData;
            
            // Create preview
            this.xmlFlowPreview = {
                label: flowData.label || flowData.apiName || 'Unnamed Flow',
                apiName: flowData.apiName || flowData.fullName || this.xmlFileName.replace('.flow-meta.xml', '').replace('.xml', ''),
                processType: flowData.processType || 'Unknown',
                elementCount: this.countFlowElements(flowData)
            };
            
        } catch (error) {
            console.error('XML parse error:', error);
            this.xmlParseError = 'Error parsing Flow XML: ' + error.message;
        }
    }
    
    /**
     * @description Extract flow data from XML document
     */
    extractFlowDataFromXml(flowElement, xmlDoc) {
        const getText = (parent, tagName) => {
            const el = parent.querySelector(tagName) || parent.getElementsByTagName(tagName)[0];
            return el?.textContent || '';
        };
        
        // Salesforce metadata XML uses <n> for element names, not <name>
        const getName = (parent) => {
            return getText(parent, 'n') || getText(parent, 'name');
        };
        
        const getAll = (parent, tagName) => {
            return Array.from(parent.querySelectorAll(tagName) || parent.getElementsByTagName(tagName));
        };
        
        // Helper to get direct child elements only (not nested)
        const getDirectChildren = (parent, tagName) => {
            const results = [];
            const children = parent.children || parent.childNodes;
            for (let i = 0; i < children.length; i++) {
                if (children[i].tagName === tagName) {
                    results.push(children[i]);
                }
            }
            return results;
        };
        
        const flowData = {
            apiName: getText(flowElement, 'apiName') || getText(flowElement, 'fullName'),
            label: getText(flowElement, 'label'),
            processType: getText(flowElement, 'processType'),
            description: getText(flowElement, 'description'),
            start: {},
            decisions: [],
            assignments: [],
            recordCreates: [],
            recordUpdates: [],
            recordDeletes: [],
            recordLookups: [],
            screens: [],
            actionCalls: [],
            subflows: [],
            loops: [],
            waits: []
        };
        
        // Parse start element
        const startEl = flowElement.querySelector('start') || flowElement.getElementsByTagName('start')[0];
        if (startEl) {
            flowData.start = {
                triggerType: getText(startEl, 'triggerType'),
                object: getText(startEl, 'object'),
                connector: {
                    targetReference: getText(startEl, 'connector > targetReference')
                }
            };
        }
        
        // Parse decisions
        getDirectChildren(flowElement, 'decisions').forEach(el => {
            const rules = [];
            getDirectChildren(el, 'rules').forEach(ruleEl => {
                rules.push({
                    name: getName(ruleEl),
                    label: getText(ruleEl, 'label'),
                    connector: {
                        targetReference: getText(ruleEl, 'connector > targetReference')
                    }
                });
            });
            
            flowData.decisions.push({
                name: getName(el),
                label: getText(el, 'label'),
                rules: rules,
                defaultConnector: {
                    targetReference: getText(el, 'defaultConnector > targetReference')
                }
            });
        });
        
        // Parse assignments
        getDirectChildren(flowElement, 'assignments').forEach(el => {
            flowData.assignments.push({
                name: getName(el),
                label: getText(el, 'label'),
                connector: {
                    targetReference: getText(el, 'connector > targetReference')
                }
            });
        });
        
        // Parse recordCreates
        getDirectChildren(flowElement, 'recordCreates').forEach(el => {
            flowData.recordCreates.push({
                name: getName(el),
                label: getText(el, 'label'),
                object: getText(el, 'object'),
                connector: {
                    targetReference: getText(el, 'connector > targetReference')
                },
                faultConnector: {
                    targetReference: getText(el, 'faultConnector > targetReference')
                }
            });
        });
        
        // Parse recordUpdates
        getDirectChildren(flowElement, 'recordUpdates').forEach(el => {
            flowData.recordUpdates.push({
                name: getName(el),
                label: getText(el, 'label'),
                object: getText(el, 'object'),
                connector: {
                    targetReference: getText(el, 'connector > targetReference')
                },
                faultConnector: {
                    targetReference: getText(el, 'faultConnector > targetReference')
                }
            });
        });
        
        // Parse recordDeletes
        getDirectChildren(flowElement, 'recordDeletes').forEach(el => {
            flowData.recordDeletes.push({
                name: getName(el),
                label: getText(el, 'label'),
                object: getText(el, 'object'),
                connector: {
                    targetReference: getText(el, 'connector > targetReference')
                },
                faultConnector: {
                    targetReference: getText(el, 'faultConnector > targetReference')
                }
            });
        });
        
        // Parse recordLookups
        getDirectChildren(flowElement, 'recordLookups').forEach(el => {
            flowData.recordLookups.push({
                name: getName(el),
                label: getText(el, 'label'),
                object: getText(el, 'object'),
                connector: {
                    targetReference: getText(el, 'connector > targetReference')
                },
                faultConnector: {
                    targetReference: getText(el, 'faultConnector > targetReference')
                }
            });
        });
        
        // Parse screens
        getDirectChildren(flowElement, 'screens').forEach(el => {
            flowData.screens.push({
                name: getName(el),
                label: getText(el, 'label'),
                connector: {
                    targetReference: getText(el, 'connector > targetReference')
                }
            });
        });
        
        // Parse actionCalls
        getDirectChildren(flowElement, 'actionCalls').forEach(el => {
            flowData.actionCalls.push({
                name: getName(el),
                label: getText(el, 'label'),
                actionName: getText(el, 'actionName'),
                actionType: getText(el, 'actionType'),
                connector: {
                    targetReference: getText(el, 'connector > targetReference')
                },
                faultConnector: {
                    targetReference: getText(el, 'faultConnector > targetReference')
                }
            });
        });
        
        // Parse subflows
        getDirectChildren(flowElement, 'subflows').forEach(el => {
            flowData.subflows.push({
                name: getName(el),
                label: getText(el, 'label'),
                flowName: getText(el, 'flowName'),
                connector: {
                    targetReference: getText(el, 'connector > targetReference')
                }
            });
        });
        
        // Parse loops
        getDirectChildren(flowElement, 'loops').forEach(el => {
            flowData.loops.push({
                name: getName(el),
                label: getText(el, 'label'),
                collectionReference: getText(el, 'collectionReference'),
                nextValueConnector: {
                    targetReference: getText(el, 'nextValueConnector > targetReference')
                },
                noMoreValuesConnector: {
                    targetReference: getText(el, 'noMoreValuesConnector > targetReference')
                }
            });
        });
        
        // Parse waits
        getDirectChildren(flowElement, 'waits').forEach(el => {
            flowData.waits.push({
                name: getName(el),
                label: getText(el, 'label'),
                defaultConnector: {
                    targetReference: getText(el, 'defaultConnector > targetReference')
                }
            });
        });
        
        return flowData;
    }
    
    /**
     * @description Count total flow elements for preview
     */
    countFlowElements(flowData) {
        let count = 0;
        ['decisions', 'assignments', 'recordCreates', 'recordUpdates', 'recordDeletes', 
         'recordLookups', 'screens', 'actionCalls', 'subflows', 'loops', 'waits'].forEach(key => {
            if (flowData[key] && Array.isArray(flowData[key])) {
                count += flowData[key].length;
            }
        });
        return count;
    }
    
    /**
     * @description Import the parsed XML flow data
     */
    handleXmlImport() {
        if (!this.xmlFlowData) {
            this.showToast('Error', 'No flow data to import', 'error');
            return;
        }
        
        try {
            const canvas = this.template.querySelector('c-process-canvas');
            if (!canvas) {
                this.showToast('Error', 'Canvas not available', 'error');
                return;
            }
            
            // Store imported flow info for properties panel
            this.importedFlowInfo = {
                name: this.xmlFlowData.apiName || this.xmlFileName,
                label: this.xmlFlowData.label || this.xmlFlowData.apiName || 'Imported Flow',
                processType: this.xmlFlowData.processType || ''
            };
            
            // Import into canvas
            const result = canvas.importFromSalesforce(this.xmlFlowData, {
                clearCanvas: true,
                autoLayout: true
            });
            
            // Organize into lanes if option is selected
            if (this.organizeIntoLanesOnImport) {
                // Small delay to ensure canvas has rendered
                // eslint-disable-next-line @lwc/lwc/no-async-operation
                setTimeout(() => {
                    canvas.organizeIntoLanes();
                    this.calculateProcessScore();
                }, 100);
            }
            
            this.showToast(
                'Success', 
                `Imported ${result.elements.length} elements and ${result.connections.length} connections from "${this.xmlFileName}"`,
                'success'
            );
            
            // Mark as having changes
            this.hasUnsavedChanges = true;
            
            // Close modal and reset state
            this.handleImportModalClose();
            
        } catch (error) {
            console.error('XML import error:', error);
            this.showToast('Error', 'Failed to import: ' + error.message, 'error');
        }
    }
    
    /**
     * @description Handle the convert event from salesforceMetadataSelector
     * Receives the Flow/Apex/LWC metadata and converts to BPMN
     */
    handleImportConvert(event) {
        const { type, item, previewData } = event.detail;
        
        try {
            const canvas = this.template.querySelector('c-process-canvas');
            if (!canvas) {
                this.showToast('Error', 'Canvas not available', 'error');
                return;
            }
            
            if (type === 'flow') {
                // Check if we have flow metadata to convert
                if (!previewData?.flowXml) {
                    this.showToast(
                        'Error', 
                        'Unable to retrieve Flow metadata. Please ensure you have permission to access the Tooling API and try again.',
                        'error'
                    );
                    return;
                }
                
                // Parse Flow XML/JSON to data for the canvas import method
                const flowData = this.parseFlowMetadata(previewData);
                
                // Store imported flow info for properties panel
                this.importedFlowInfo = {
                    name: flowData.apiName || flowData.fullName || item.name,
                    label: flowData.label || item.label || item.name,
                    processType: flowData.processType || ''
                };
                
                // Import into canvas
                const result = canvas.importFromSalesforce(flowData, {
                    clearCanvas: true,
                    autoLayout: true
                });
                
                // Organize into lanes if option is selected
                if (this.organizeIntoLanesOnImport) {
                    // Small delay to ensure canvas has rendered
                    // eslint-disable-next-line @lwc/lwc/no-async-operation
                    setTimeout(() => {
                        canvas.organizeIntoLanes();
                        this.calculateProcessScore();
                    }, 100);
                }
                
                this.showToast(
                    'Success', 
                    `Imported ${result.elements.length} elements and ${result.connections.length} connections from "${item.label}"`,
                    'success'
                );
                
                // Mark as having changes
                this.hasUnsavedChanges = true;
                
            } else if (type === 'apex') {
                // Create a single ServiceTask for the Apex action
                const elementId = canvas.addElement('ServiceTask', 300, 200, previewData?.invocableLabel || item.name, {
                    apiName: item.name,
                    flowElementType: 'FlowActionCall',
                    actionType: 'apex',
                    apexClassName: item.name,
                    apexMethodName: previewData?.invocableMethodName || '',
                    isImported: true
                });
                
                this.showToast('Success', `Added Apex action "${item.name}" to canvas`, 'success');
                this.hasUnsavedChanges = true;
                
            } else if (type === 'lwc') {
                // Create a ScreenTask for the LWC component
                const elementId = canvas.addElement('ScreenTask', 300, 200, previewData?.masterLabel || item.developerName, {
                    apiName: item.developerName,
                    flowElementType: 'FlowScreen',
                    lwcComponentName: item.developerName,
                    isImported: true
                });
                
                this.showToast('Success', `Added LWC screen "${item.developerName}" to canvas`, 'success');
                this.hasUnsavedChanges = true;
            }
            
            // Close modal
            this.showImportModal = false;
            
        } catch (error) {
            console.error('Import error:', error);
            this.showToast('Error', 'Failed to import: ' + this.parseError(error), 'error');
        }
    }
    
    /**
     * @description Parse Flow metadata from preview data
     * Converts the Tooling API response to a format usable by canvas.importFromSalesforce
     */
    parseFlowMetadata(previewData) {
        // If flowXml is already JSON (from Tooling API Metadata field), use directly
        if (typeof previewData.flowXml === 'object') {
            return {
                ...previewData.flowXml,
                apiName: previewData.apiName,
                label: previewData.label
            };
        }
        
        // If it's XML string, parse it
        // Note: For full XML parsing, you might need a dedicated parser
        // This is a simplified approach assuming JSON from Tooling API
        try {
            const parsed = JSON.parse(previewData.flowXml);
            return {
                ...parsed,
                apiName: previewData.apiName,
                label: previewData.label
            };
        } catch (e) {
            // Return basic structure if parsing fails
            return {
                apiName: previewData.apiName,
                label: previewData.label,
                processType: previewData.processType,
                start: {
                    triggerType: ''
                }
            };
        }
    }
    
    /**
     * @description Handle flow imported event from canvas
     */
    handleFlowImported(event) {
        const { elementCount, connectionCount, metadata } = event.detail;
        console.log(`Flow imported: ${elementCount} elements, ${connectionCount} connections`, metadata);
        
        // Recalculate score
        this.calculateInitialScore();
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