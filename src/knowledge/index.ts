/**
 * Knowledge Layer
 *
 * Re-exports all knowledge layer implementations:
 * - ProjectSnapshotService
 * - SemanticIndexService
 * - ConventionExtractorService
 * - ErrorMemoryService
 * - KnowledgeStore
 */

// Project Snapshot
export {
  ProjectSnapshotService,
  createProjectSnapshotService,
} from './ProjectSnapshotService';

// Semantic Index
export {
  SemanticIndexService,
  createSemanticIndexService,
} from './SemanticIndexService';

// Convention Extractor
export {
  ConventionExtractorService,
  createConventionExtractorService,
} from './ConventionExtractorService';

// Error Memory
export {
  ErrorMemoryService,
  createErrorMemoryService,
} from './ErrorMemoryService';

// Knowledge Store
export { KnowledgeStore, createKnowledgeStore } from './KnowledgeStore';

// Semantic Analyzer
export {
  SemanticAnalyzerService,
  createSemanticAnalyzerService,
} from './SemanticAnalyzerService';
