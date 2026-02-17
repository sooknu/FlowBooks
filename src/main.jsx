import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from '@/lib/queryClient';
import App from '@/App';
import '@/index.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/toaster';

// ─── Error reporting ─────────────────────────────────────────────────────────

const DEDUP_MS = 30_000;
const _recentErrors = new Map(); // message → timestamp

function reportError({ message, stack, url, componentStack }) {
  if (!message) return;
  const now = Date.now();
  if (_recentErrors.get(message) > now - DEDUP_MS) return;
  _recentErrors.set(message, now);
  // Keep map from growing forever
  if (_recentErrors.size > 50) {
    const cutoff = now - DEDUP_MS;
    for (const [k, v] of _recentErrors) {
      if (v < cutoff) _recentErrors.delete(k);
    }
  }
  fetch('/api/errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ message, stack, url, componentStack }),
  }).catch(() => {}); // fire-and-forget
}

// Global handlers for uncaught errors outside React
window.addEventListener('error', (e) => {
  reportError({
    message: e.message,
    stack: e.error?.stack,
    url: window.location.href,
  });
});
window.addEventListener('unhandledrejection', (e) => {
  const err = e.reason;
  reportError({
    message: err?.message || String(err),
    stack: err?.stack,
    url: window.location.href,
  });
});

// ─── Error Boundary ──────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, errorInfo) {
    // Auto-reload once on chunk load failures (stale deploy)
    if (error?.message?.includes('Failed to fetch dynamically imported module') ||
        error?.message?.includes('Loading chunk') ||
        error?.message?.includes('Loading CSS chunk')) {
      const key = 'chunk_reload';
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
        return;
      }
      sessionStorage.removeItem(key);
    }
    reportError({
      message: error?.message,
      stack: error?.stack,
      url: window.location.href,
      componentStack: errorInfo?.componentStack,
    });
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ color: '#37352f', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ color: '#dc2626' }}>App Error</h1>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', opacity: 0.6 }}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
          <Toaster />
        </AuthProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
