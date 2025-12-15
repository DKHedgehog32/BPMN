/**
 * @description Process Improvement Suggestions Component
 * @author Dennis van Musschenbroek (DvM) - Cobra CRM B.V.
 * @date 2024-12-15
 * @version 1.0.0
 * 
 * EXPLANATION:
 * This component analyzes the Process Quality Score data and generates
 * intelligent, actionable suggestions for improving the process model.
 * It uses the 7PMG guidelines, Cardoso CFC metrics, and Signavio best
 * practices to provide specific recommendations.
 * 
 * Suggestions are categorized by:
 * - Priority: Critical, High, Medium, Low
 * - Category: Complexity, Structure, Naming, Modularity, Handover
 * - Impact: Score improvement estimate
 * 
 * DEPENDENCIES:
 * - scoreData from processCanvas.calculateProcessScore()
 * 
 * CHANGELOG:
 * Version | Date       | Author | Description
 * --------|------------|--------|------------------------------------------
 * 1.0.0   | 2024-12-15 | DvM    | Initial creation
 * 
 * USAGE:
 * <c-process-suggestions
 *     score-data={scoreData}
 *     oncustomclick={handleSuggestionClick}>
 * </c-process-suggestions>
 */
import { LightningElement, api, track } from 'lwc';

export default class ProcessSuggestions extends LightningElement {
    
    // =========================================================================
    // PUBLIC API
    // =========================================================================
    
    @api
    get scoreData() {
        return this._scoreData;
    }
    set scoreData(value) {
        this._scoreData = value;
        if (value) {
            this.generateSuggestions();
        } else {
            this.suggestions = [];
        }
    }
    
    // =========================================================================
    // TRACKED STATE
    // =========================================================================
    
    @track _scoreData = null;
    @track suggestions = [];
    @track expandedCategories = ['critical', 'high', 'medium', 'low']; // All expanded by default
    @track selectedSuggestion = null;
    
    // =========================================================================
    // GETTERS
    // =========================================================================
    
    get hasSuggestions() {
        return this.suggestions && this.suggestions.length > 0;
    }
    
    get totalSuggestions() {
        return this.suggestions.length;
    }
    
    get criticalCount() {
        return this.suggestions.filter(s => s.priority === 'critical').length;
    }
    
    get highCount() {
        return this.suggestions.filter(s => s.priority === 'high').length;
    }
    
    get mediumCount() {
        return this.suggestions.filter(s => s.priority === 'medium').length;
    }
    
    get lowCount() {
        return this.suggestions.filter(s => s.priority === 'low').length;
    }
    
    get groupedSuggestions() {
        // Group suggestions by priority
        const groups = [
            { priority: 'critical', label: 'Critical', icon: 'utility:error', variant: 'error', items: [] },
            { priority: 'high', label: 'High Priority', icon: 'utility:warning', variant: 'warning', items: [] },
            { priority: 'medium', label: 'Medium Priority', icon: 'utility:info', variant: '', items: [] },
            { priority: 'low', label: 'Suggestions', icon: 'utility:light_bulb', variant: '', items: [] }
        ];
        
        this.suggestions.forEach(s => {
            const group = groups.find(g => g.priority === s.priority);
            if (group) {
                group.items.push(s);
            }
        });
        
        // Only return groups with items, add expanded state
        return groups
            .filter(g => g.items.length > 0)
            .map(g => ({
                ...g,
                key: g.priority,
                count: g.items.length,
                isExpanded: this.expandedCategories.includes(g.priority),
                expandIcon: this.expandedCategories.includes(g.priority) ? 'utility:chevrondown' : 'utility:chevronright',
                headerClass: `suggestion-group-header priority-${g.priority}`
            }));
    }
    
    get estimatedScoreImprovement() {
        // Sum up potential improvements from all suggestions
        let total = 0;
        this.suggestions.forEach(s => {
            total += s.scoreImpact || 0;
        });
        return Math.min(100 - (this._scoreData?.total || 0), Math.round(total));
    }
    
    get potentialScore() {
        return Math.min(100, (this._scoreData?.total || 0) + this.estimatedScoreImprovement);
    }
    
    get potentialGrade() {
        const score = this.potentialScore;
        if (score >= 90) return 'A';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 60) return 'D';
        return 'F';
    }
    
    // =========================================================================
    // SUGGESTION GENERATION ENGINE
    // =========================================================================
    
    generateSuggestions() {
        if (!this._scoreData) {
            this.suggestions = [];
            return;
        }
        
        const suggestions = [];
        const data = this._scoreData;
        const dims = data.dimensions || {};
        
        // Generate suggestions based on each dimension and metric
        this.analyzeComplexity(suggestions, data);
        this.analyzeStructure(suggestions, data, dims);
        this.analyzeModularity(suggestions, data, dims);
        this.analyzeNaming(suggestions, data, dims);
        this.analyzeHandover(suggestions, data, dims);
        this.analyzeStartEnd(suggestions, data, dims);
        this.analyzeGateways(suggestions, data);
        
        // Sort by priority and impact
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        suggestions.sort((a, b) => {
            const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
            if (pDiff !== 0) return pDiff;
            return (b.scoreImpact || 0) - (a.scoreImpact || 0);
        });
        
        // Add unique keys
        suggestions.forEach((s, idx) => {
            s.key = `suggestion-${idx}`;
            s.categoryClass = `suggestion-category cat-${s.category.toLowerCase()}`;
        });
        
        this.suggestions = suggestions;
    }
    
    // -------------------------------------------------------------------------
    // Complexity Analysis (CFC)
    // -------------------------------------------------------------------------
    
    analyzeComplexity(suggestions, data) {
        const cfc = data.cfc || 0;
        const weightedCfc = data.weightedCfc || 0;
        const controlFlowDim = data.dimensions?.controlFlow || 100;
        
        // Critical: CFC > 15
        if (cfc > 15) {
            suggestions.push({
                priority: 'critical',
                category: 'Complexity',
                title: 'Extremely High Control-Flow Complexity',
                description: `The process has a CFC of ${cfc}, which is extremely high. Research shows error probability exceeds 60% at this level.`,
                recommendation: 'Decompose the process into sub-processes. Identify clusters of related activities and extract them into separate callable processes.',
                actions: [
                    'Identify the most complex gateway clusters',
                    'Extract decision-heavy sections into sub-processes',
                    'Use Call Activity elements to reference sub-processes',
                    'Consider using a state machine pattern for complex state transitions'
                ],
                scoreImpact: 15,
                guideline: 'Cardoso CFC / 7PMG G7'
            });
        } else if (cfc > 9) {
            suggestions.push({
                priority: 'high',
                category: 'Complexity',
                title: 'High Control-Flow Complexity',
                description: `CFC of ${cfc} exceeds the recommended threshold of 9. This makes the process harder to understand and maintain.`,
                recommendation: 'Simplify branching logic or extract complex decision paths into sub-processes.',
                actions: [
                    'Review gateways with high fan-out (3+ outgoing paths)',
                    'Consider merging similar decision paths',
                    'Replace OR gateways with XOR where possible'
                ],
                scoreImpact: 10,
                guideline: 'Cardoso CFC'
            });
        } else if (controlFlowDim < 80 && controlFlowDim > 0) {
            // Control flow dimension is below optimal but CFC isn't critical
            suggestions.push({
                priority: 'medium',
                category: 'Complexity',
                title: 'Control Flow Could Be Simpler',
                description: `Control Flow score is ${controlFlowDim}%. While not critical, simplifying branching could improve maintainability.`,
                recommendation: 'Review gateway complexity and consider simplification opportunities.',
                actions: [
                    'Check for unnecessary decision points',
                    'Consider if some paths can be combined',
                    'Review gateway nesting depth'
                ],
                scoreImpact: 5,
                guideline: 'Cardoso CFC'
            });
        }
        
        // Nesting depth issues
        if (weightedCfc > cfc * 1.5 && cfc > 3) {
            suggestions.push({
                priority: 'high',
                category: 'Complexity',
                title: 'Deep Nesting Detected',
                description: `The weighted CFC (${weightedCfc}) is significantly higher than base CFC (${cfc}), indicating deeply nested decision structures.`,
                recommendation: 'Flatten the process structure by extracting nested branches into separate flows.',
                actions: [
                    'Identify nested gateway patterns',
                    'Consider using boundary events instead of nested decisions',
                    'Extract deeply nested sections into sub-processes'
                ],
                scoreImpact: 8,
                guideline: 'Signavio Flow Complexity'
            });
        }
    }
    
    // -------------------------------------------------------------------------
    // Structure Analysis (Split/Join Matching)
    // -------------------------------------------------------------------------
    
    analyzeStructure(suggestions, data, dims) {
        const structuredness = data.structuredness || {};
        // Use score from detailed object OR from dimensions
        const score = structuredness.score !== undefined ? structuredness.score : (dims.structuredness || 100);
        const unmatchedSplits = structuredness.unmatchedSplits || [];
        const unmatchedJoins = structuredness.unmatchedJoins || [];
        
        // Also check dimension score as fallback
        const dimScore = dims.structuredness;
        const effectiveScore = Math.min(score, dimScore !== undefined ? dimScore : 100);
        
        if (effectiveScore < 50) {
            suggestions.push({
                priority: 'critical',
                category: 'Structure',
                title: 'Poor Process Structuredness',
                description: `Structuredness score of ${effectiveScore}% indicates significant structural issues. ${unmatchedSplits.length} unmatched splits and ${unmatchedJoins.length} unmatched joins detected.`,
                recommendation: 'Ensure every split gateway has a corresponding join gateway of the same type.',
                actions: [
                    'Match each XOR split with an XOR join',
                    'Match each AND split with an AND join',
                    'Review highlighted gateways in the issues list',
                    'Consider using structured patterns (sequence, parallel, choice)'
                ],
                scoreImpact: 12,
                guideline: '7PMG G4',
                relatedElements: [...unmatchedSplits.map(s => s.element?.id), ...unmatchedJoins.map(j => j.element?.id)].filter(Boolean)
            });
        } else if (effectiveScore < 80) {
            suggestions.push({
                priority: 'medium',
                category: 'Structure',
                title: 'Structural Improvements Needed',
                description: `Some gateway splits don't have matching joins. This can lead to unexpected runtime behavior.`,
                recommendation: 'Review the unmatched gateways and add corresponding join points.',
                actions: [
                    'Check parallel paths merge correctly',
                    'Ensure exclusive paths rejoin appropriately'
                ],
                scoreImpact: 6,
                guideline: '7PMG G4'
            });
        }
    }
    
    // -------------------------------------------------------------------------
    // Modularity Analysis
    // -------------------------------------------------------------------------
    
    analyzeModularity(suggestions, data, dims) {
        const noajs = data.noajs || 0;
        const modularity = dims.modularity || 100;
        
        if (noajs > 50) {
            suggestions.push({
                priority: 'critical',
                category: 'Modularity',
                title: 'Process Too Large',
                description: `With ${noajs} elements, this process exceeds the 50-element threshold. Research shows error probability exceeds 50% at this size.`,
                recommendation: 'Split the process into multiple sub-processes. Aim for 15-30 elements per process.',
                actions: [
                    'Identify logical phases or stages in the process',
                    'Extract each phase into a separate sub-process',
                    'Use Call Activities to connect the sub-processes',
                    'Consider a main "orchestrator" process that calls sub-processes'
                ],
                scoreImpact: 15,
                guideline: '7PMG G7'
            });
        } else if (noajs > 33) {
            suggestions.push({
                priority: 'high',
                category: 'Modularity',
                title: 'Process Approaching Size Limit',
                description: `${noajs} elements is above the optimal range (17-33). Consider splitting for better maintainability.`,
                recommendation: 'Identify sections that could become reusable sub-processes.',
                actions: [
                    'Look for repeated patterns that could be extracted',
                    'Consider error handling as a separate sub-process',
                    'Extract approval workflows as reusable components'
                ],
                scoreImpact: 8,
                guideline: '7PMG G7'
            });
        }
        
        // Check for lack of sub-processes in large flows
        if (noajs > 20 && modularity < 60) {
            const hasSubprocesses = (data.elements || []).some(el => 
                el.type === 'SubProcess' || el.type === 'CallActivity'
            );
            
            if (!hasSubprocesses) {
                suggestions.push({
                    priority: 'medium',
                    category: 'Modularity',
                    title: 'No Sub-Process Decomposition',
                    description: 'This process has no sub-processes despite its size. Decomposition improves reusability and testability.',
                    recommendation: 'Extract logical units into callable sub-processes.',
                    actions: [
                        'Identify self-contained activity groups',
                        'Create sub-processes for reusable logic',
                        'Use Call Activities for synchronous sub-process calls'
                    ],
                    scoreImpact: 5,
                    guideline: '7PMG G7'
                });
            }
        }
    }
    
    // -------------------------------------------------------------------------
    // Naming Analysis
    // -------------------------------------------------------------------------
    
    analyzeNaming(suggestions, data, dims) {
        const naming = dims.naming || 100;
        const namingQuality = data.namingQuality || {};
        const poorLabels = namingQuality.poorLabels || 0;
        const totalLabeled = namingQuality.totalLabeled || 0;
        
        if (naming < 50) {
            suggestions.push({
                priority: 'high',
                category: 'Naming',
                title: 'Poor Activity Naming',
                description: `${poorLabels} out of ${totalLabeled} activities have poor labels. Good naming uses verb-object format (e.g., "Review Application").`,
                recommendation: 'Rename activities using the verb-object pattern for clarity.',
                actions: [
                    'Use action verbs: Create, Send, Review, Approve, Process, Update',
                    'Include the business object: Application, Order, Request, Document',
                    'Avoid vague names: "Handle", "Do", "Process Data"',
                    'Keep labels concise but descriptive (2-4 words)'
                ],
                scoreImpact: 8,
                guideline: '7PMG G6',
                examples: [
                    { bad: 'Application Processing', good: 'Process Application' },
                    { bad: 'Review', good: 'Review Credit Report' },
                    { bad: 'Send', good: 'Send Approval Email' }
                ]
            });
        } else if (naming < 80) {
            suggestions.push({
                priority: 'low',
                category: 'Naming',
                title: 'Naming Improvements Suggested',
                description: 'Some activity labels could be clearer. Review the naming issues in the score details.',
                recommendation: 'Apply verb-object naming pattern consistently.',
                actions: [
                    'Review flagged activities in the issues list',
                    'Ensure consistent naming style across the process'
                ],
                scoreImpact: 4,
                guideline: '7PMG G6'
            });
        }
    }
    
    // -------------------------------------------------------------------------
    // Handover Analysis
    // -------------------------------------------------------------------------
    
    analyzeHandover(suggestions, data, dims) {
        const handover = dims.handover || 100;
        const handoverData = data.handoverComplexity || {};
        const transitions = handoverData.transitions || [];
        const isEstimated = handoverData.isEstimated || false;
        
        if (handover < 50) {
            suggestions.push({
                priority: 'high',
                category: 'Handover',
                title: 'Excessive Role Transitions',
                description: `The process has ${transitions.length} role transitions, which increases coordination overhead and potential for errors.`,
                recommendation: 'Reduce handovers by grouping related activities by role.',
                actions: [
                    'Reorganize activities so each role completes related tasks together',
                    'Consider using pools/lanes to visualize role responsibilities',
                    'Automate transitions where possible',
                    'Reduce back-and-forth between roles'
                ],
                scoreImpact: 8,
                guideline: 'Signavio Handover'
            });
        }
        
        // Add lane suggestion if no lanes and handover is estimated
        if (isEstimated) {
            suggestions.push({
                priority: 'low',
                category: 'Handover',
                title: 'Add Swim Lanes for Clarity',
                description: 'The process has no role assignments. Adding swim lanes improves clarity and helps identify handover points.',
                recommendation: 'Assign activities to roles using swim lanes.',
                actions: [
                    'Create a Pool for the process',
                    'Add Lanes for each role (e.g., Customer, Sales, Fulfillment)',
                    'Drag activities into appropriate lanes',
                    'Review handover score after lane assignment'
                ],
                scoreImpact: 3,
                guideline: 'BPMN Best Practice'
            });
        }
    }
    
    // -------------------------------------------------------------------------
    // Start/End Analysis
    // -------------------------------------------------------------------------
    
    analyzeStartEnd(suggestions, data, dims) {
        const startEnd = dims.startEnd || 100;
        const startCount = data.startEventCount || 1;
        const endCount = data.endEventCount || 1;
        
        if (startCount > 1) {
            suggestions.push({
                priority: 'medium',
                category: 'Structure',
                title: 'Multiple Start Events',
                description: `The process has ${startCount} start events. This can make the process entry point ambiguous.`,
                recommendation: 'Consider using a single start event with an initial gateway to handle different triggers.',
                actions: [
                    'Combine start events into a single entry point',
                    'Use an exclusive gateway after start to route based on trigger type',
                    'Or clearly document when each start event applies'
                ],
                scoreImpact: 3,
                guideline: '7PMG G3'
            });
        }
        
        if (endCount > 3) {
            suggestions.push({
                priority: 'medium',
                category: 'Structure',
                title: 'Too Many End Events',
                description: `${endCount} end events may indicate fragmented process outcomes. Consider consolidating.`,
                recommendation: 'Use fewer, well-named end events that clearly represent business outcomes.',
                actions: [
                    'Identify if multiple ends represent the same outcome',
                    'Merge paths that lead to the same result',
                    'Name end events clearly (e.g., "Order Completed", "Order Cancelled")'
                ],
                scoreImpact: 2,
                guideline: '7PMG G3'
            });
        }
    }
    
    // -------------------------------------------------------------------------
    // Gateway-Specific Analysis
    // -------------------------------------------------------------------------
    
    analyzeGateways(suggestions, data) {
        const gatewayDetails = data.gatewayDetails || [];
        const cfcBreakdown = data.cfcBreakdown || {};
        
        // High OR gateway usage
        if (cfcBreakdown.or > cfcBreakdown.xor) {
            suggestions.push({
                priority: 'high',
                category: 'Complexity',
                title: 'Overuse of OR Gateways',
                description: `OR gateways (${cfcBreakdown.or} CFC) contribute more complexity than XOR (${cfcBreakdown.xor}). OR has exponential complexity.`,
                recommendation: 'Replace OR gateways with XOR or AND where the logic allows.',
                actions: [
                    'Review each OR gateway - can it be XOR (exclusive)?',
                    'If paths are always parallel, use AND instead',
                    'Document the conditions for OR gates clearly'
                ],
                scoreImpact: 6,
                guideline: '7PMG G5'
            });
        }
        
        // High fan-out gateways
        const highFanOut = gatewayDetails.filter(g => g.fanOut >= 4);
        if (highFanOut.length > 0) {
            suggestions.push({
                priority: 'medium',
                category: 'Complexity',
                title: 'High Fan-Out Gateways',
                description: `${highFanOut.length} gateway(s) have 4 or more outgoing paths. This increases cognitive load.`,
                recommendation: 'Consider restructuring decisions into cascaded gateways.',
                actions: [
                    'Break complex decisions into a series of simpler binary choices',
                    'Group related options under intermediate gateways',
                    'Consider using a decision table for complex logic'
                ],
                scoreImpact: 4,
                guideline: 'Cardoso CFC',
                relatedElements: highFanOut.map(g => g.elementId)
            });
        }
    }
    
    // =========================================================================
    // EVENT HANDLERS
    // =========================================================================
    
    handleGroupToggle(event) {
        const priority = event.currentTarget.dataset.priority;
        const idx = this.expandedCategories.indexOf(priority);
        if (idx > -1) {
            // Remove from expanded
            this.expandedCategories = this.expandedCategories.filter(p => p !== priority);
        } else {
            // Add to expanded
            this.expandedCategories = [...this.expandedCategories, priority];
        }
    }
    
    handleCloseRequest() {
        this.dispatchEvent(new CustomEvent('closerequest'));
    }
    
    handleSuggestionClick(event) {
        const key = event.currentTarget.dataset.key;
        const suggestion = this.suggestions.find(s => s.key === key);
        if (suggestion) {
            this.selectedSuggestion = suggestion;
            
            // Dispatch event for parent to handle (e.g., highlight elements)
            this.dispatchEvent(new CustomEvent('suggestionselect', {
                detail: {
                    suggestion,
                    relatedElements: suggestion.relatedElements || []
                }
            }));
        }
    }
    
    handleCloseSuggestionDetail() {
        this.selectedSuggestion = null;
    }
    
    handleApplySuggestion(event) {
        const key = event.currentTarget.dataset.key;
        const suggestion = this.suggestions.find(s => s.key === key);
        if (suggestion) {
            this.dispatchEvent(new CustomEvent('applysuggestion', {
                detail: { suggestion }
            }));
        }
    }
}