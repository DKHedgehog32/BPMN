/**
 * @description Salesforce Metadata Selector for BPMN conversion
 * @author Dennis van Musschenbroek (DvM) - Cobra CRM B.V.
 * @date 2024-12-14
 * @version 2.0.0
 * 
 * EXPLANATION:
 * This component provides a tabbed interface for browsing and selecting existing
 * Salesforce metadata (Flows, Apex classes, LWCs) from the connected org. Users
 * can search, filter, preview, and select items to convert to BPMN diagrams.
 * 
 * The component supports three tabs:
 * - Flows: Screen Flows, Auto-launched Flows, Record-Triggered Flows
 * - Apex: Classes with @InvocableMethod annotation
 * - LWC: Components with lightning__FlowScreen or lightning__FlowAction targets
 * 
 * Selected metadata is passed to the parent component for BPMN conversion.
 * 
 * DEPENDENCIES:
 * - FlowMetadataController: Queries Flow definitions
 * - ApexMetadataController: Queries invocable Apex classes
 * - LwcMetadataController: Queries Flow-enabled LWCs
 * 
 * CHANGELOG:
 * Version | Date       | Author | Description
 * --------|------------|--------|------------------------------------------
 * 1.0.0   | 2024-12-14 | DvM    | Initial creation - tabbed metadata selector
 * 2.0.0   | 2024-12-14 | DvM    | Redesigned UI, custom HTML tables, fixed process type filter
 * 
 * SECURITY:
 * - Respects user permissions via Apex controllers
 * - No direct data manipulation
 * 
 * USAGE:
 * <c-salesforce-metadata-selector
 *     onmetadataselect={handleMetadataSelect}
 *     onconvert={handleConvertToBpmn}>
 * </c-salesforce-metadata-selector>
 */
import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// Apex controllers
import getActiveFlows from '@salesforce/apex/FlowMetadataController.getActiveFlows';
import getProcessTypeOptions from '@salesforce/apex/FlowMetadataController.getProcessTypeOptions';
import getFlowMetadata from '@salesforce/apex/FlowMetadataController.getFlowMetadata';
import getInvocableApexClasses from '@salesforce/apex/ApexMetadataController.getInvocableApexClasses';
import getApexClassMetadata from '@salesforce/apex/ApexMetadataController.getApexClassMetadata';
import getFlowScreenComponents from '@salesforce/apex/LwcMetadataController.getFlowScreenComponents';
import getLwcMetadata from '@salesforce/apex/LwcMetadataController.getLwcMetadata';

export default class SalesforceMetadataSelector extends LightningElement {
    
    // =========================================================================
    // TRACKED STATE
    // =========================================================================
    
    @track activeTab = 'flows';
    @track isLoading = false;
    @track searchTerm = '';
    @track selectedProcessTypes = [];
    
    // Internal data storage (use getters for enhanced display)
    _flows = [];
    _apexClasses = [];
    _lwcComponents = [];
    
    // Flow data
    @track processTypeOptions = [];
    @track selectedFlow = null;
    
    // Apex data
    @track selectedApexClass = null;
    
    // LWC data
    @track selectedLwc = null;
    
    // Selected item for conversion
    @track selectedItem = null;
    @track selectedItemType = null;
    
    // Preview panel state
    @track showPreview = false;
    @track previewData = null;
    
    // =========================================================================
    // WIRE ADAPTERS
    // =========================================================================
    
    /**
     * Load process type options for filter dropdown
     */
    @wire(getProcessTypeOptions)
    wiredProcessTypes({ error, data }) {
        if (data) {
            this.processTypeOptions = data;
        } else if (error) {
            console.error('Error loading process types:', error);
        }
    }
    
    // =========================================================================
    // LIFECYCLE HOOKS
    // =========================================================================
    
    connectedCallback() {
        // Load initial data for default tab
        this.loadFlows();
    }
    
    // =========================================================================
    // GETTERS - Tab State
    // =========================================================================
    
    get isFlowsTab() {
        return this.activeTab === 'flows';
    }
    
    get isApexTab() {
        return this.activeTab === 'apex';
    }
    
    get isLwcTab() {
        return this.activeTab === 'lwc';
    }
    
    get flowsTabClass() {
        return this.isFlowsTab ? 'tab-item active' : 'tab-item';
    }
    
    get apexTabClass() {
        return this.isApexTab ? 'tab-item active' : 'tab-item';
    }
    
    get lwcTabClass() {
        return this.isLwcTab ? 'tab-item active' : 'tab-item';
    }
    
    // =========================================================================
    // GETTERS - Data Display
    // =========================================================================
    
    get hasFlows() {
        return this._flows && this._flows.length > 0;
    }
    
    get hasApexClasses() {
        return this._apexClasses && this._apexClasses.length > 0;
    }
    
    get hasLwcComponents() {
        return this._lwcComponents && this._lwcComponents.length > 0;
    }
    
    get hasSelection() {
        return this.selectedItem !== null;
    }
    
    get selectionLabel() {
        if (!this.selectedItem) return '';
        return this.selectedItem.label || this.selectedItem.name || this.selectedItem.developerName;
    }
    
    get selectionType() {
        if (!this.selectedItemType) return '';
        const types = {
            'flow': 'Salesforce Flow',
            'apex': 'Apex Invocable Action',
            'lwc': 'Lightning Web Component'
        };
        return types[this.selectedItemType] || this.selectedItemType;
    }
    
    get convertButtonLabel() {
        return `Convert to BPMN`;
    }
    
    get convertButtonDisabled() {
        return !this.hasSelection || this.isLoading;
    }
    
    get footerInfoText() {
        if (this.hasSelection) {
            return `Selected: ${this.selectionLabel}`;
        }
        return 'Select an item to convert to BPMN';
    }
    
    get selectedApex() {
        return this.selectedItemType === 'apex' ? this.selectedItem : null;
    }
    
    get selectedProcessType() {
        return this.selectedProcessTypes.length > 0 ? this.selectedProcessTypes[0] : '';
    }
    
    // Enhanced flows with row styling
    get flows() {
        return this._flows.map((flow, index) => ({
            ...flow,
            rowNumber: index + 1,
            rowClass: this.selectedItem?.id === flow.id ? 'selected' : '',
            statusClass: `status-badge ${(flow.status || '').toLowerCase()}`
        }));
    }
    
    set flows(value) {
        this._flows = value;
    }
    
    // Enhanced apex classes with row styling
    get apexClasses() {
        return this._apexClasses.map((apex, index) => ({
            ...apex,
            rowNumber: index + 1,
            rowClass: this.selectedItem?.id === apex.id ? 'selected' : ''
        }));
    }
    
    set apexClasses(value) {
        this._apexClasses = value;
    }
    
    // Enhanced LWC components with row styling  
    get lwcComponents() {
        return this._lwcComponents.map((lwc, index) => ({
            ...lwc,
            rowNumber: index + 1,
            rowClass: this.selectedItem?.id === lwc.id ? 'selected' : ''
        }));
    }
    
    set lwcComponents(value) {
        this._lwcComponents = value;
    }
    
    // Note: Table columns removed - using custom HTML table instead of lightning-datatable
    
    // =========================================================================
    // EVENT HANDLERS - Tabs
    // =========================================================================
    
    handleTabClick(event) {
        const tab = event.currentTarget.dataset.tab;
        if (tab === this.activeTab) return;
        
        this.activeTab = tab;
        this.clearSelection();
        
        // Load data for selected tab
        switch (tab) {
            case 'flows':
                this.loadFlows();
                break;
            case 'apex':
                this.loadApexClasses();
                break;
            case 'lwc':
                this.loadLwcComponents();
                break;
        }
    }
    
    // =========================================================================
    // EVENT HANDLERS - Search & Filter
    // =========================================================================
    
    handleSearchChange(event) {
        this.searchTerm = event.target.value;
        
        // Debounce search
        clearTimeout(this._searchTimeout);
        this._searchTimeout = setTimeout(() => {
            this.performSearch();
        }, 300);
    }
    
    handleSearchKeyUp(event) {
        if (event.key === 'Enter') {
            clearTimeout(this._searchTimeout);
            this.performSearch();
        }
    }
    
    handleProcessTypeChange(event) {
        const value = event.detail.value;
        // Combobox returns a single value, not an array
        // Empty string means "All Types"
        this.selectedProcessTypes = value ? [value] : [];
        this.loadFlows();
    }
    
    performSearch() {
        switch (this.activeTab) {
            case 'flows':
                this.loadFlows();
                break;
            case 'apex':
                this.loadApexClasses();
                break;
            case 'lwc':
                this.loadLwcComponents();
                break;
        }
    }
    
    handleRefresh() {
        this.performSearch();
    }
    
    // =========================================================================
    // EVENT HANDLERS - Row Selection (datatable)
    // =========================================================================
    
    handleFlowRowSelection(event) {
        const selectedRows = event.detail.selectedRows;
        if (selectedRows.length > 0) {
            this.selectedFlow = selectedRows[0];
            this.selectedItem = selectedRows[0];
            this.selectedItemType = 'flow';
            this.loadFlowPreview(selectedRows[0].apiName);
        } else {
            this.clearSelection();
        }
    }
    
    handleApexRowSelection(event) {
        const selectedRows = event.detail.selectedRows;
        if (selectedRows.length > 0) {
            this.selectedApexClass = selectedRows[0];
            this.selectedItem = selectedRows[0];
            this.selectedItemType = 'apex';
            this.loadApexPreview(selectedRows[0].id);
        } else {
            this.clearSelection();
        }
    }
    
    handleLwcRowSelection(event) {
        const selectedRows = event.detail.selectedRows;
        if (selectedRows.length > 0) {
            this.selectedLwc = selectedRows[0];
            this.selectedItem = selectedRows[0];
            this.selectedItemType = 'lwc';
            this.loadLwcPreview(selectedRows[0].id);
        } else {
            this.clearSelection();
        }
    }
    
    // =========================================================================
    // EVENT HANDLERS - Row Click (custom table)
    // =========================================================================
    
    handleFlowRowClick(event) {
        const flowId = event.currentTarget.dataset.id;
        const flow = this._flows.find(f => f.id === flowId);
        if (flow) {
            this.selectedFlow = flow;
            this.selectedItem = flow;
            this.selectedItemType = 'flow';
            this.loadFlowPreview(flow.apiName);
        }
    }
    
    handleApexRowClick(event) {
        const apexId = event.currentTarget.dataset.id;
        const apex = this._apexClasses.find(a => a.id === apexId);
        if (apex) {
            this.selectedApexClass = apex;
            this.selectedItem = apex;
            this.selectedItemType = 'apex';
            this.loadApexPreview(apex.id);
        }
    }
    
    handleLwcRowClick(event) {
        const lwcId = event.currentTarget.dataset.id;
        const lwc = this._lwcComponents.find(l => l.id === lwcId);
        if (lwc) {
            this.selectedLwc = lwc;
            this.selectedItem = lwc;
            this.selectedItemType = 'lwc';
            this.loadLwcPreview(lwc.id);
        }
    }
    
    // =========================================================================
    // EVENT HANDLERS - Actions
    // =========================================================================
    
    handleConvert() {
        if (!this.selectedItem || !this.selectedItemType) {
            this.showToast('Error', 'Please select an item to convert', 'error');
            return;
        }
        
        // Dispatch event with selected metadata for conversion
        this.dispatchEvent(new CustomEvent('convert', {
            detail: {
                type: this.selectedItemType,
                item: this.selectedItem,
                previewData: this.previewData
            }
        }));
    }
    
    handleCancel() {
        this.clearSelection();
        this.dispatchEvent(new CustomEvent('cancel'));
    }
    
    // =========================================================================
    // DATA LOADING METHODS
    // =========================================================================
    
    async loadFlows() {
        this.isLoading = true;
        try {
            const result = await getActiveFlows({
                searchTerm: this.searchTerm,
                processTypes: this.selectedProcessTypes.length > 0 ? this.selectedProcessTypes : null
            });
            
            // Store in internal array (getter handles enhancement)
            this._flows = result;
            
        } catch (error) {
            console.error('Error loading flows:', error);
            this.showToast('Error', 'Failed to load Flows', 'error');
            this._flows = [];
        } finally {
            this.isLoading = false;
        }
    }
    
    async loadApexClasses() {
        this.isLoading = true;
        try {
            const result = await getInvocableApexClasses({
                searchTerm: this.searchTerm,
                includeManaged: false
            });
            
            this._apexClasses = result;
            
        } catch (error) {
            console.error('Error loading Apex classes:', error);
            this.showToast('Error', 'Failed to load Apex classes', 'error');
            this._apexClasses = [];
        } finally {
            this.isLoading = false;
        }
    }
    
    async loadLwcComponents() {
        this.isLoading = true;
        try {
            const result = await getFlowScreenComponents({
                searchTerm: this.searchTerm,
                includeManaged: false
            });
            
            this._lwcComponents = result;
            
        } catch (error) {
            console.error('Error loading LWC components:', error);
            this.showToast('Error', 'Failed to load LWC components', 'error');
            this._lwcComponents = [];
        } finally {
            this.isLoading = false;
        }
    }
    
    // =========================================================================
    // PREVIEW LOADING METHODS
    // =========================================================================
    
    async loadFlowPreview(apiName) {
        // Preview loading is optional - don't show spinner or warnings
        // The basic flow info from selection is already displayed
        try {
            const result = await getFlowMetadata({
                flowApiName: apiName,
                versionNumber: null // Active version
            });
            
            if (result.success) {
                this.previewData = result;
                this.showPreview = true;
            }
            // Silently ignore preview failures - selection still works
            
        } catch (error) {
            console.error('Error loading Flow preview:', error);
            // Don't show error to user - preview is optional enhancement
        }
    }
    
    async loadApexPreview(classId) {
        try {
            const result = await getApexClassMetadata({
                classId: classId
            });
            
            if (result.success) {
                this.previewData = result;
                this.showPreview = true;
            }
            
        } catch (error) {
            console.error('Error loading Apex preview:', error);
        }
    }
    
    async loadLwcPreview(componentId) {
        try {
            const result = await getLwcMetadata({
                componentId: componentId
            });
            
            if (result.success) {
                this.previewData = result;
                this.showPreview = true;
            }
            
        } catch (error) {
            console.error('Error loading LWC preview:', error);
        }
    }
    
    // =========================================================================
    // UTILITY METHODS
    // =========================================================================
    
    clearSelection() {
        this.selectedItem = null;
        this.selectedItemType = null;
        this.selectedFlow = null;
        this.selectedApexClass = null;
        this.selectedLwc = null;
        this.showPreview = false;
        this.previewData = null;
    }
    
    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({
            title,
            message,
            variant
        }));
    }
}