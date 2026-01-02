import { ExtensionStateProvider } from './context/ExtensionStateContext';
import { StreamingProvider } from './context/StreamingContext';
import { ChatView } from './components/chat/ChatView';
import { Sidebar } from './components/sidebar/Sidebar';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { useVSCodeAPI } from './hooks/useVSCodeAPI';
import { useState, useEffect } from 'react';

function App() {
  const vscode = useVSCodeAPI();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Notify extension that webview is ready
  useEffect(() => {
    vscode.postMessage({ type: 'ready' });
  }, [vscode]);

  return (
    <ErrorBoundary>
      <ExtensionStateProvider>
        <StreamingProvider>
          <div className="app-container">
            <header className="app-header">
              <div className="header-left">
                <button className="menu-button" title="Menu">
                  <span className="codicon codicon-menu"></span>
                </button>
                <h1 className="app-title">AlterCode</h1>
              </div>
              <div className="header-right">
                <button className="icon-button" title="Settings">
                  <span className="codicon codicon-gear"></span>
                </button>
                <button className="icon-button" title="Help">
                  <span className="codicon codicon-question"></span>
                </button>
              </div>
            </header>

            <main className="app-main">
              <div className={`main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
                <ChatView />
              </div>

              <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
              />
            </main>
          </div>
        </StreamingProvider>
      </ExtensionStateProvider>
    </ErrorBoundary>
  );
}

export default App;
