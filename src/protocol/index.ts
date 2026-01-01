/**
 * Protocol Layer
 *
 * Re-exports all protocol layer implementations:
 * - IntentParserService
 * - ScopeGuardService
 * - PreflightCheckerService
 * - RollbackService
 * - ImpactAnalyzerService
 */

// Intent Parser
export { IntentParserService, createIntentParserService } from './IntentParserService';

// Scope Guard
export { ScopeGuardService, createScopeGuardService } from './ScopeGuardService';

// Preflight Checker
export { PreflightCheckerService, createPreflightCheckerService } from './PreflightCheckerService';

// Rollback
export { RollbackService, createRollbackService } from './RollbackService';

// Impact Analyzer
export { ImpactAnalyzerService, createImpactAnalyzerService } from './ImpactAnalyzerService';

// Virtual Branch
export {
  VirtualBranchService,
  createVirtualBranchService,
} from './VirtualBranchService';

// Merge Engine
export {
  MergeEngineService,
  createMergeEngineService,
} from './MergeEngineService';

// Approval Service
export {
  ApprovalService,
  createApprovalService,
} from './ApprovalService';
