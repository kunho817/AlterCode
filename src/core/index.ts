/**
 * Core Layer
 *
 * Re-exports core layer implementations:
 * - AlterCodeCore (main orchestrator)
 * - ServiceRegistry (DI bootstrap)
 */

// Core
export { AlterCodeCore, createAlterCodeCore, SERVICE_TOKENS } from './AlterCodeCore';

// Service Registry
export { registerServices, bootstrap, quickStart } from './ServiceRegistry';
