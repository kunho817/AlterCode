# AlterCode v2: Comprehensive Misalignment Analysis

## Executive Summary

Deep analysis reveals **15 functional misalignments** between backend capabilities, configuration, and UI exposure. These fall into 4 categories:

1. **Missing Settings** - Backend features with no user-facing configuration
2. **Disconnected Config** - Settings defined but not wired up
3. **UI Gaps** - Settings exist but not exposed in Mission Control
4. **Missing Service Methods** - Event handlers calling non-existent methods

---

## Category 1: Missing Settings in package.json

### 1.1 Claude Access Mode (API vs CLI)

**Backend capability**: Full support for Claude via API or CLI
- Type: `ClaudeAccessMode = 'api' | 'cli'` (infrastructure.ts:367)
- Used in: `HierarchyModelRouter` constructor
- Used in: `ServiceRegistry.ts:362` - `config.llm?.claudeMode ?? 'api'`

**Missing**:
- [ ] No `altercode.claude.mode` in package.json
- [ ] No `altercode.llm.claudeMode` in package.json
- [ ] `loadConfiguration()` doesn't read this setting
- [ ] UI settings panel doesn't expose this

**Impact**: Users cannot choose between API and CLI mode

---

### 1.2 Claude CLI Path

**Backend capability**: Configurable CLI executable path
- Type: `ClaudeConfig.cliPath` (infrastructure.ts:316)
- Used in: `ClaudeCodeAdapter` constructor
- Default: `'claude'`

**Missing**:
- [ ] No `altercode.claude.cliPath` in package.json
- [ ] Not exposed in UI

**Impact**: Users with non-standard Claude CLI installations cannot use CLI mode

---

### 1.3 Fallback Enable/Disable

**Backend capability**: Automatic fallback from Claude to GLM on failure
- Used in: `HierarchyModelRouter` with `enableFallback` option
- Currently: Hardcoded to `true` in ServiceRegistry.ts:372

**Missing**:
- [ ] No `altercode.llm.enableFallback` in package.json
- [ ] Not exposed in UI

**Impact**: Users cannot disable fallback behavior

---

### 1.4 Claude Timeout

**Backend capability**: Configurable request timeout
- Type: `ClaudeConfig.timeout` (infrastructure.ts:319)
- Default: 300000 (5 minutes)
- Used in: `ClaudeCodeAdapter`

**Missing**:
- [ ] No `altercode.claude.timeout` in package.json
- [ ] Not exposed in UI

---

## Category 2: Disconnected Configuration

### 2.1 Extension loadConfiguration() Mismatch

**Problem**: `loadConfiguration()` reads legacy settings, not the new dual-provider settings.

**Currently reads** (extension.ts:133-145):
```typescript
llm: {
  provider: vsConfig.get('llm.provider', 'claude'),  // NOT IN package.json
  apiKey: vsConfig.get('llm.apiKey', ''),            // NOT IN package.json
  model: vsConfig.get('llm.model'),                  // NOT IN package.json
}
```

**package.json has**:
- `altercode.claude.apiKey`
- `altercode.claude.model`
- `altercode.glm.apiKey`
- `altercode.glm.model`
- `altercode.glm.endpoint`

**Impact**: The dual-provider architecture settings are defined but never read by the extension!

---

### 2.2 Verification Strictness Not Wired

**Status**: Defined in package.json, but not read or used
- Setting: `altercode.verification.strictness` (package.json:195-200)
- **NOT** read by `loadConfiguration()`
- **NOT** passed to verification services

**Impact**: Setting has no effect

---

### 2.3 GLM Endpoint Not Wired

**Status**: Defined in package.json, partially wired
- Setting: `altercode.glm.endpoint` (package.json:179-182)
- Read by UI for display
- **NOT** read by `loadConfiguration()` for actual use

**Impact**: Custom GLM endpoints won't work

---

## Category 3: UI Gaps

### 3.1 Settings Not Exposed in UI

These settings exist in package.json but are NOT shown in Mission Control Settings:

| Setting | package.json | UI Exposed |
|---------|--------------|------------|
| `maxContextTokens` | Yes (line 184) | No |
| `verification.strictness` | Yes (line 195) | No |
| `claude.mode` (API/CLI) | No | No |
| `claude.cliPath` | No | No |
| `llm.enableFallback` | No | No |
| `claude.timeout` | No | No |

---

### 3.2 API Keys Displayed Insecurely

**Current**: API keys shown as plain text inputs
**Should**: Use password-type inputs with show/hide toggle

---

## Category 4: Service Methods (VERIFIED OK)

### 4.1 MissionManager.pause() / .resume() - EXISTS

**Location**: `src/execution/MissionManager.ts:301-327`
- `pause()` sets status to 'paused', emits 'mission:paused'
- `resume()` sets status to 'active', emits 'mission:resumed'

### 4.2 TaskManager.retry() - EXISTS

**Location**: `src/execution/TaskManager.ts:425-449`
- Creates new task with `retriedFrom` and `retryCount` metadata

---

## Priority Fix List

### Critical (Breaking functionality)

1. **Fix loadConfiguration()** - Must read dual-provider settings (claude.apiKey, glm.apiKey, etc.)

### High (Major missing feature)

2. **Add Claude mode setting** - API vs CLI selection (package.json + UI)
3. **Wire verification strictness** - Currently defined but has no effect

### Medium (UX improvements)

4. **Add missing settings to UI** - maxContextTokens, strictness
5. **Add Claude CLI path setting** - for non-standard installations
6. **Secure API key display** - use password-type inputs with toggle

### Low (Nice to have)

7. **Add fallback toggle** - enable/disable automatic fallback
8. **Add timeout setting** - configurable request timeouts

---

## Implementation Plan

### Phase 1: Critical Fixes

1. Update `loadConfiguration()` in extension.ts:
   ```typescript
   return {
     projectRoot,
     claude: {
       apiKey: vsConfig.get('claude.apiKey', ''),
       model: vsConfig.get('claude.model', 'claude-opus-4-5-20251101'),
       cliPath: vsConfig.get('claude.cliPath', 'claude'),
       timeout: vsConfig.get('claude.timeout', 300000),
     },
     glm: {
       apiKey: vsConfig.get('glm.apiKey', ''),
       model: vsConfig.get('glm.model', 'glm-4.7'),
       endpoint: vsConfig.get('glm.endpoint', 'https://api.z.ai/...'),
     },
     llm: {
       claudeMode: vsConfig.get('claude.mode', 'api'),
       enableFallback: vsConfig.get('llm.enableFallback', true),
     },
     verification: {
       strictness: vsConfig.get('verification.strictness', 'standard'),
     },
     maxContextTokens: vsConfig.get('maxContextTokens', 128000),
     logLevel: vsConfig.get('logLevel', 'info'),
   };
   ```

2. Add missing MissionManager methods (if needed)
3. Add missing TaskManager methods (if needed)

### Phase 2: New Settings

Add to package.json:
```json
"altercode.claude.mode": {
  "type": "string",
  "enum": ["api", "cli"],
  "default": "api",
  "description": "How to access Claude: 'api' for direct API, 'cli' for Claude Code CLI"
},
"altercode.claude.cliPath": {
  "type": "string",
  "default": "claude",
  "description": "Path to Claude Code CLI executable"
},
"altercode.claude.timeout": {
  "type": "number",
  "default": 300000,
  "description": "Request timeout in milliseconds"
},
"altercode.llm.enableFallback": {
  "type": "boolean",
  "default": true,
  "description": "Enable automatic fallback to GLM when Claude fails"
}
```

### Phase 3: UI Enhancements

Add to Settings section in MissionControlPanel:
- Claude mode dropdown (API/CLI)
- Claude CLI path input (shown only when CLI mode selected)
- Verification strictness dropdown
- Max context tokens input
- Fallback toggle
- Timeout input

---

## Verification Status

### Service Methods - VERIFIED OK

| Method | Location | Status |
|--------|----------|--------|
| `MissionManager.pause()` | line 301 | Exists |
| `MissionManager.resume()` | line 315 | Exists |
| `TaskManager.retry()` | line 425 | Exists |

---

*Analysis completed: 2026-01-02*
