/**
 * Mission Control App
 * Main application component with 3-column layout
 */

import React, { useState, useCallback } from 'react';
import { useApp, useSettings } from './context/AppContext';
import { actions } from './hooks/useVSCodeAPI';
import { Section, ApprovalMode } from './types';

// Import sections
import { ChatSection } from './components/sections/ChatSection';
import { MissionSection } from './components/sections/MissionSection';
import { ActivitySection } from './components/sections/ActivitySection';
import { AgentsSection } from './components/sections/AgentsSection';
import { ConfigSection } from './components/sections/ConfigSection';

// Import widgets
import { QuotaWidget } from './components/widgets/QuotaWidget';
import { ApprovalsWidget } from './components/widgets/ApprovalsWidget';
import { ConflictsWidget } from './components/widgets/ConflictsWidget';
import { AgentsWidget } from './components/widgets/AgentsWidget';
import { PerformanceWidget } from './components/widgets/PerformanceWidget';

// Navigation icons (simple Unicode/text icons)
const NAV_ICONS: Record<Section, string> = {
  chat: '💬',
  mission: '🎯',
  activity: '📊',
  agents: '🤖',
  config: '⚙️',
};

const NAV_LABELS: Record<Section, string> = {
  chat: 'Chat',
  mission: 'Missions',
  activity: 'Activity',
  agents: 'Hierarchy',
  config: 'Settings',
};

function App() {
  const { currentSection, setCurrentSection, state } = useApp();
  const settings = useSettings();
  const [inputValue, setInputValue] = useState('');

  // Derive approval mode from settings or state
  const approvalMode = settings['approval.defaultMode'] || state.approvalMode;
  const modeMap: Record<ApprovalMode, string> = {
    full_automation: 'auto',
    step_by_step: 'step',
    fully_manual: 'manual',
  };
  const activeMode = modeMap[approvalMode] || 'step';

  // Handle mode toggle
  const handleModeChange = useCallback((mode: 'auto' | 'step' | 'manual') => {
    const modeMapping: Record<string, ApprovalMode> = {
      auto: 'full_automation',
      step: 'step_by_step',
      manual: 'fully_manual',
    };
    actions.updateSetting('approval.defaultMode', modeMapping[mode]);
  }, []);

  // Handle input
  const handleSend = useCallback(() => {
    const content = inputValue.trim();
    if (!content) return;

    if (content.startsWith('/')) {
      actions.sendCommand(content);
    } else {
      actions.sendMessage(content);
    }
    setInputValue('');
  }, [inputValue]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Get connection status
  const getConnectionStatus = () => {
    if (state.activeMissions.some(m => m.status === 'running' || m.status === 'active')) {
      return { dot: '', text: 'Active' };
    }
    return { dot: '', text: 'Ready' };
  };

  const status = getConnectionStatus();

  return (
    <>
      {/* HEADER */}
      <header className="header">
        <div className="header-left">
          <span className="header-title">AlterCode Mission Control</span>
          <div className="header-status">
            <span className="status-dot"></span>
            <span>{status.text}</span>
          </div>
        </div>
        <div className="header-right">
          <div className="mode-toggle">
            <button
              className={`mode-btn ${activeMode === 'auto' ? 'active' : ''}`}
              onClick={() => handleModeChange('auto')}
            >
              Auto
            </button>
            <button
              className={`mode-btn ${activeMode === 'step' ? 'active' : ''}`}
              onClick={() => handleModeChange('step')}
            >
              Step
            </button>
            <button
              className={`mode-btn ${activeMode === 'manual' ? 'active' : ''}`}
              onClick={() => handleModeChange('manual')}
            >
              Manual
            </button>
          </div>
          <button className="icon-btn" onClick={actions.refresh} title="Refresh">
            ↻
          </button>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div className="main-layout">
        {/* SIDEBAR */}
        <nav className="sidebar">
          {(['chat', 'mission', 'activity', 'agents'] as Section[]).map((section) => (
            <button
              key={section}
              className={`nav-item ${currentSection === section ? 'active' : ''}`}
              onClick={() => setCurrentSection(section)}
            >
              <span className="nav-icon">{NAV_ICONS[section]}</span>
              <span>{NAV_LABELS[section]}</span>
              {section === 'mission' && state.activeMissions.filter(m => m.status === 'running' || m.status === 'active').length > 0 && (
                <span className="badge">
                  {state.activeMissions.filter(m => m.status === 'running' || m.status === 'active').length}
                </span>
              )}
            </button>
          ))}

          <div className="nav-separator"></div>

          <button
            className={`nav-item ${currentSection === 'config' ? 'active' : ''}`}
            onClick={() => setCurrentSection('config')}
          >
            <span className="nav-icon">{NAV_ICONS.config}</span>
            <span>{NAV_LABELS.config}</span>
          </button>
        </nav>

        {/* CONTENT AREA */}
        <div className="content-area">
          <div className="main-content">
            {/* Sections */}
            <ChatSection active={currentSection === 'chat'} />
            <MissionSection active={currentSection === 'mission'} />
            <ActivitySection active={currentSection === 'activity'} />
            <AgentsSection active={currentSection === 'agents'} />
            <ConfigSection active={currentSection === 'config'} />
          </div>

          {/* STATUS PANEL */}
          <aside className="status-panel">
            <QuotaWidget />
            <ApprovalsWidget />
            <ConflictsWidget />
            <AgentsWidget />
            <PerformanceWidget />
          </aside>
        </div>
      </div>

      {/* INPUT BAR */}
      <div className="input-bar">
        <div className="input-wrapper">
          <input
            type="text"
            className="input-field"
            placeholder="Type a message or /help for commands..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <button className="send-btn" onClick={handleSend}>
          Send
        </button>
      </div>
    </>
  );
}

export default App;
