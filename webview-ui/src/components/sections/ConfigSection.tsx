/**
 * Config Section
 * Settings management with toggles, inputs, selects
 */

import { useState, useEffect } from 'react';
import { useSettings } from '../../context/AppContext';
import { actions } from '../../hooks/useVSCodeAPI';

interface ConfigSectionProps {
  active: boolean;
}

// Toggle component
function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div
      className={`config-toggle ${value ? 'on' : ''}`}
      onClick={() => onChange(!value)}
    ></div>
  );
}

export function ConfigSection({ active }: ConfigSectionProps) {
  const settings = useSettings();

  // Local state for inputs
  const [claudeMode, setClaudeMode] = useState(settings['claude.mode'] || 'api');
  const [claudeModel, setClaudeModel] = useState(settings['claude.model'] || '');
  const [claudeCliPath, setClaudeCliPath] = useState(settings['claude.cliPath'] || 'claude');
  const [claudeTimeout, setClaudeTimeout] = useState(settings['claude.timeout'] || 300000);
  const [glmModel, setGlmModel] = useState(settings['glm.model'] || '');
  const [glmEndpoint, setGlmEndpoint] = useState(settings['glm.endpoint'] || '');
  const [approvalMode, setApprovalMode] = useState(
    settings['approval.defaultMode'] || 'step_by_step'
  );
  const [verificationStrictness, setVerificationStrictness] = useState(
    settings['verification.strictness'] || 'standard'
  );
  const [maxContextTokens, setMaxContextTokens] = useState(
    settings['maxContextTokens'] || 128000
  );
  const [maxActivity, setMaxActivity] = useState(
    settings['activity.maxDisplayEntries'] || 100
  );
  const [logLevel, setLogLevel] = useState(settings['logLevel'] || 'info');

  // Boolean settings
  const [quotaNotify, setQuotaNotify] = useState(
    settings['ui.notifyOnQuotaWarning'] !== false
  );
  const [approvalNotify, setApprovalNotify] = useState(
    settings['ui.notifyOnApprovalRequired'] !== false
  );
  const [showQuota, setShowQuota] = useState(
    settings['ui.showQuotaInStatusBar'] !== false
  );
  const [enableFallback, setEnableFallback] = useState(
    settings['llm.enableFallback'] !== false
  );
  const [autoResolve, setAutoResolve] = useState(
    settings['conflicts.autoResolveSimple'] !== false
  );

  // Sync with settings
  useEffect(() => {
    if (settings['claude.mode']) setClaudeMode(settings['claude.mode']);
    if (settings['claude.model']) setClaudeModel(settings['claude.model']);
    if (settings['claude.cliPath']) setClaudeCliPath(settings['claude.cliPath']);
    if (settings['claude.timeout']) setClaudeTimeout(settings['claude.timeout']);
    if (settings['glm.model']) setGlmModel(settings['glm.model']);
    if (settings['glm.endpoint']) setGlmEndpoint(settings['glm.endpoint']);
    if (settings['approval.defaultMode']) setApprovalMode(settings['approval.defaultMode']);
    if (settings['verification.strictness'])
      setVerificationStrictness(settings['verification.strictness']);
    if (settings['maxContextTokens']) setMaxContextTokens(settings['maxContextTokens']);
    if (settings['activity.maxDisplayEntries'])
      setMaxActivity(settings['activity.maxDisplayEntries']);
    if (settings['logLevel']) setLogLevel(settings['logLevel']);
  }, [settings]);

  // Update setting helper
  const updateSetting = (key: string, value: unknown) => {
    actions.updateSetting(key, value);
  };

  return (
    <div className={`section ${active ? 'active' : ''}`}>
      <div className="section-header">
        <span className="section-title">Settings</span>
      </div>
      <div className="section-body">
        {/* Claude Settings */}
        <div className="config-section">
          <div className="config-title">Claude (Higher Tiers: Sovereign, Overlord, Lord)</div>

          <div className="config-row">
            <span className="config-label">Access Mode</span>
            <select
              className="config-select"
              value={claudeMode}
              onChange={(e) => {
                setClaudeMode(e.target.value as 'api' | 'cli');
                updateSetting('claude.mode', e.target.value);
              }}
            >
              <option value="api">API (Direct)</option>
              <option value="cli">CLI (Claude Code)</option>
            </select>
          </div>

          {claudeMode === 'api' && (
            <div className="config-row">
              <span className="config-label">API Key</span>
              <input
                type="password"
                className="config-input"
                placeholder="sk-ant-..."
                onChange={(e) => updateSetting('claude.apiKey', e.target.value)}
              />
            </div>
          )}

          {claudeMode === 'cli' && (
            <div className="config-row">
              <span className="config-label">CLI Path</span>
              <input
                type="text"
                className="config-input"
                value={claudeCliPath}
                placeholder="claude"
                onChange={(e) => {
                  setClaudeCliPath(e.target.value);
                  updateSetting('claude.cliPath', e.target.value);
                }}
              />
            </div>
          )}

          <div className="config-row">
            <span className="config-label">Model</span>
            <input
              type="text"
              className="config-input"
              value={claudeModel}
              placeholder="claude-opus-4-5-20251101"
              onChange={(e) => {
                setClaudeModel(e.target.value);
                updateSetting('claude.model', e.target.value);
              }}
            />
          </div>

          <div className="config-row">
            <span className="config-label">Timeout (ms)</span>
            <input
              type="number"
              className="config-input"
              value={claudeTimeout}
              style={{ width: 100 }}
              onChange={(e) => {
                setClaudeTimeout(parseInt(e.target.value));
                updateSetting('claude.timeout', parseInt(e.target.value));
              }}
            />
          </div>
        </div>

        {/* GLM Settings */}
        <div className="config-section">
          <div className="config-title">GLM (Worker Tier)</div>

          <div className="config-row">
            <span className="config-label">API Key</span>
            <input
              type="password"
              className="config-input"
              placeholder="Enter GLM API key"
              onChange={(e) => updateSetting('glm.apiKey', e.target.value)}
            />
          </div>

          <div className="config-row">
            <span className="config-label">Model</span>
            <input
              type="text"
              className="config-input"
              value={glmModel}
              placeholder="glm-4.7"
              onChange={(e) => {
                setGlmModel(e.target.value);
                updateSetting('glm.model', e.target.value);
              }}
            />
          </div>

          <div className="config-row">
            <span className="config-label">Endpoint</span>
            <input
              type="text"
              className="config-input"
              value={glmEndpoint}
              style={{ width: 200 }}
              placeholder="https://api.z.ai/..."
              onChange={(e) => {
                setGlmEndpoint(e.target.value);
                updateSetting('glm.endpoint', e.target.value);
              }}
            />
          </div>
        </div>

        {/* Approval Mode */}
        <div className="config-section">
          <div className="config-title">Approval Mode</div>

          <div className="config-row">
            <span className="config-label">Mode</span>
            <select
              className="config-select"
              value={approvalMode}
              onChange={(e) => {
                setApprovalMode(e.target.value as any);
                updateSetting('approval.defaultMode', e.target.value);
              }}
            >
              <option value="full_automation">Full Automation</option>
              <option value="step_by_step">Step by Step</option>
              <option value="fully_manual">Fully Manual</option>
            </select>
          </div>
        </div>

        {/* Notifications */}
        <div className="config-section">
          <div className="config-title">Notifications</div>

          <div className="config-row">
            <span className="config-label">Quota Warnings</span>
            <Toggle
              value={quotaNotify}
              onChange={(v) => {
                setQuotaNotify(v);
                updateSetting('ui.notifyOnQuotaWarning', v);
              }}
            />
          </div>

          <div className="config-row">
            <span className="config-label">Approval Required</span>
            <Toggle
              value={approvalNotify}
              onChange={(v) => {
                setApprovalNotify(v);
                updateSetting('ui.notifyOnApprovalRequired', v);
              }}
            />
          </div>

          <div className="config-row">
            <span className="config-label">Show Quota in Status Bar</span>
            <Toggle
              value={showQuota}
              onChange={(v) => {
                setShowQuota(v);
                updateSetting('ui.showQuotaInStatusBar', v);
              }}
            />
          </div>
        </div>

        {/* Verification */}
        <div className="config-section">
          <div className="config-title">Verification</div>

          <div className="config-row">
            <span className="config-label">Strictness</span>
            <select
              className="config-select"
              value={verificationStrictness}
              onChange={(e) => {
                setVerificationStrictness(e.target.value as any);
                updateSetting('verification.strictness', e.target.value);
              }}
            >
              <option value="strict">Strict</option>
              <option value="standard">Standard</option>
              <option value="lenient">Lenient</option>
            </select>
          </div>
        </div>

        {/* Advanced */}
        <div className="config-section">
          <div className="config-title">Advanced</div>

          <div className="config-row">
            <span className="config-label">Max Context Tokens</span>
            <input
              type="number"
              className="config-input"
              value={maxContextTokens}
              style={{ width: 100 }}
              onChange={(e) => {
                setMaxContextTokens(parseInt(e.target.value));
                updateSetting('maxContextTokens', parseInt(e.target.value));
              }}
            />
          </div>

          <div className="config-row">
            <span className="config-label">Max Activity Entries</span>
            <input
              type="number"
              className="config-input"
              value={maxActivity}
              style={{ width: 80 }}
              onChange={(e) => {
                setMaxActivity(parseInt(e.target.value));
                updateSetting('activity.maxDisplayEntries', parseInt(e.target.value));
              }}
            />
          </div>

          <div className="config-row">
            <span className="config-label">Enable Fallback (GLM)</span>
            <Toggle
              value={enableFallback}
              onChange={(v) => {
                setEnableFallback(v);
                updateSetting('llm.enableFallback', v);
              }}
            />
          </div>

          <div className="config-row">
            <span className="config-label">Auto-resolve Simple Conflicts</span>
            <Toggle
              value={autoResolve}
              onChange={(v) => {
                setAutoResolve(v);
                updateSetting('conflicts.autoResolveSimple', v);
              }}
            />
          </div>

          <div className="config-row">
            <span className="config-label">Log Level</span>
            <select
              className="config-select"
              value={logLevel}
              onChange={(e) => {
                setLogLevel(e.target.value as any);
                updateSetting('logLevel', e.target.value);
              }}
            >
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
          </div>
        </div>

        <div className="config-note">
          Claude is used for higher-level agents (Sovereign, Overlord, Lord). GLM is used for
          Worker tier. Settings are automatically saved.
        </div>
      </div>
    </div>
  );
}
