
import React, { Component } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Root Error Boundary for absolute crash protection
class ErrorBoundary extends Component<any, any> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("CRITICAL ROOT ERROR:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6 text-white font-sans">
          <div className="max-w-md w-full bg-[#1e293b] border-2 border-[#ef4444] p-8 shadow-2xl">
            <h1 className="text-2xl font-black uppercase tracking-tighter text-[#ef4444] mb-4">System Identity Failure</h1>
            <p className="text-sm text-[#cbd5e1] mb-6 font-bold leading-relaxed uppercase tracking-wider">
              A critical runtime error has occurred in the application core engine.
            </p>
            <div className="bg-black/50 p-4 font-mono text-[10px] text-[#f87171] mb-6 border border-[#7f1d1d]/50 overflow-x-auto">
              Error type: BOOT_INITIALIZATION_EXHAUSTED
            </div>
            <button 
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="w-full bg-[#dc2626] hover:bg-[#b91c1c] text-white font-black py-4 uppercase tracking-widest text-xs transition-all shadow-[4px_4px_0_rgba(0,0,0,0.3)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              Reset System & Re-initialize
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
