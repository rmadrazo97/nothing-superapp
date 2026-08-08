'use client';

/**
 * Error boundary for the `/app/*` rendering region.
 *
 * WHY here and not the root layout: this boundary wraps `{children}`
 * inside `<Shell>` so a runtime error in a mini-app collapses only the
 * content area — the TabBar (routing, assistant, settings) and the
 * global ToastContainer remain mounted and reachable. A root-layout
 * boundary would take down the shell chrome too, defeating the point.
 *
 * Class component is required because `componentDidCatch` +
 * `getDerivedStateFromError` are not available in function components.
 * `resetKey` allows a parent (e.g. a route change effect) to reset the
 * boundary declaratively without needing an imperative ref.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Change this value (e.g. to the current pathname) to force a reset. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Tagged so ops dashboards / kimi log routing can filter easily.
    // eslint-disable-next-line no-console
    console.error('[nothing:mini-app-crash]', error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ error: null });
    // Full route refresh — safer than trying to re-render the crashed
    // subtree in place. `window.location.reload()` avoids importing
    // next/navigation into a class component and pulls fresh RSC data.
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    return <ErrorFallback error={this.state.error} onReset={this.handleReset} />;
  }
}

function ErrorFallback({
  error,
  onReset,
}: {
  error: Error;
  onReset: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-visible)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-6)',
        margin: 'var(--space-4) 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      <h2
        className="display-md"
        style={{
          fontFamily: 'var(--font-display)',
          margin: 0,
        }}
      >
        Something went wrong
      </h2>
      <p
        style={{
          color: 'var(--color-text-secondary)',
          fontSize: 'var(--text-body-sm)',
          margin: 0,
          wordBreak: 'break-word',
        }}
      >
        {error.message || 'An unexpected error occurred while rendering this screen.'}
      </p>
      <div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onReset}
          style={{
            padding: 'var(--space-3) var(--space-6)',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
