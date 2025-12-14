/**
 * @description Toolbar component with actions for the process modeler
 * @author Dennis van Musschenbroek (DvM) - Cobra CRM B.V.
 * @date 2024-12-12
 * @version 1.0.1
 * 
 * EXPLANATION:
 * This component provides the main toolbar for the process modeler.
 * All computed values are pre-calculated in getters because LWC templates
 * don't support inline expressions like negation or arithmetic.
 * 
 * CHANGELOG:
 * Version | Date       | Author | Description
 * --------|------------|--------|------------------------------------------
 * 1.0.0   | 2024-12-12 | DvM    | Initial creation - toolbar actions
 * 1.0.1   | 2024-12-12 | DvM    | Fixed: pre-calculate all template expressions
 * 
 * USAGE:
 * <c-process-toolbar
 *     process-name={processName}
 *     process-status={processStatus}
 *     onsave={handleSave}>
 * </c-process-toolbar>
 */
import { LightningElement, api, track } from 'lwc';

export default class ProcessToolbar extends LightningElement {
    
    // =========================================================================
    // PUBLIC API
    // =========================================================================
    
    @api processName = 'Untitled Process';
    @api processStatus = 'Draft';
    @api currentVersion = 1;
    @api hasUnsavedChanges = false;
    @api isSaving = false;
    @api readOnly = false;
    @api zoomLevel = 100;
    
    // =========================================================================
    // TRACKED STATE
    // =========================================================================
    
    @track showGridEnabled = true;
    @track snapToGridEnabled = true;
    @track showPublishModal = false;
    @track publishNotes = '';
    
    // =========================================================================
    // GETTERS - Pre-computed values (LWC doesn't allow expressions in templates)
    // =========================================================================
    
    get saveButtonLabel() {
        if (this.isSaving) return 'Saving...';
        if (this.hasUnsavedChanges) return 'Save';
        return 'Saved';
    }
    
    get saveButtonVariant() {
        if (this.hasUnsavedChanges) return 'brand';
        return 'neutral';
    }
    
    get saveButtonDisabled() {
        return this.isSaving || !this.hasUnsavedChanges || this.readOnly;
    }
    
    get publishButtonDisabled() {
        return this.readOnly || this.processStatus === 'Published' || this.processStatus === 'Archived';
    }
    
    get statusBadgeClass() {
        const statusClasses = {
            'Draft': 'status-badge draft',
            'In Review': 'status-badge review',
            'Published': 'status-badge published',
            'Archived': 'status-badge archived'
        };
        return statusClasses[this.processStatus] || 'status-badge';
    }
    
    get zoomDisplayValue() {
        return `${Math.round(this.zoomLevel)}%`;
    }
    
    // Pre-computed disabled states (can't use ! negation in template)
    get zoomInDisabled() {
        return this.zoomLevel >= 300;
    }
    
    get zoomOutDisabled() {
        return this.zoomLevel <= 30;
    }
    
    get gridButtonVariant() {
        return this.showGridEnabled ? 'brand' : 'neutral';
    }
    
    get snapButtonVariant() {
        return this.snapToGridEnabled ? 'brand' : 'neutral';
    }
    
    // Pre-computed next version number (can't do arithmetic in template)
    get nextVersionNumber() {
        return this.currentVersion + 1;
    }
    
    get publishInfoText() {
        return `Publishing will create version ${this.nextVersionNumber} of this process. The process status will be set to "Published".`;
    }
    
    // =========================================================================
    // EVENT HANDLERS - File Operations
    // =========================================================================
    
    handleSave() {
        if (this.saveButtonDisabled) return;
        this.dispatchEvent(new CustomEvent('save'));
    }
    
    handlePublishClick() {
        this.publishNotes = '';
        this.showPublishModal = true;
    }
    
    handlePublishCancel() {
        this.showPublishModal = false;
        this.publishNotes = '';
    }
    
    handlePublishNotesChange(event) {
        this.publishNotes = event.target.value;
    }
    
    handlePublishConfirm() {
        this.showPublishModal = false;
        this.dispatchEvent(new CustomEvent('publish', {
            detail: { changeNotes: this.publishNotes }
        }));
        this.publishNotes = '';
    }
    
    // =========================================================================
    // EVENT HANDLERS - Zoom
    // =========================================================================
    
    handleZoomIn() {
        this.dispatchEvent(new CustomEvent('zoomin'));
    }
    
    handleZoomOut() {
        this.dispatchEvent(new CustomEvent('zoomout'));
    }
    
    handleZoomFit() {
        this.dispatchEvent(new CustomEvent('zoomfit'));
    }
    
    handleZoomReset() {
        this.dispatchEvent(new CustomEvent('zoomreset'));
    }
    
    // =========================================================================
    // EVENT HANDLERS - View Options
    // =========================================================================
    
    handleToggleGrid() {
        this.showGridEnabled = !this.showGridEnabled;
        this.dispatchEvent(new CustomEvent('togglegrid', {
            detail: { enabled: this.showGridEnabled }
        }));
    }
    
    handleToggleSnap() {
        this.snapToGridEnabled = !this.snapToGridEnabled;
        this.dispatchEvent(new CustomEvent('togglesnap', {
            detail: { enabled: this.snapToGridEnabled }
        }));
    }
    
    // =========================================================================
    // EVENT HANDLERS - Edit Operations
    // =========================================================================
    
    handleUndo() {
        this.dispatchEvent(new CustomEvent('undo'));
    }
    
    handleRedo() {
        this.dispatchEvent(new CustomEvent('redo'));
    }
    
    handleDelete() {
        this.dispatchEvent(new CustomEvent('deleteselected'));
    }
    
    // =========================================================================
    // EVENT HANDLERS - Process Operations
    // =========================================================================
    
    handleClone() {
        this.dispatchEvent(new CustomEvent('clone'));
    }
    
    handleExport() {
        this.dispatchEvent(new CustomEvent('export'));
    }
    
    handleShare() {
        this.dispatchEvent(new CustomEvent('share'));
    }
    
    handleVersionHistory() {
        this.dispatchEvent(new CustomEvent('versionhistory'));
    }
}
