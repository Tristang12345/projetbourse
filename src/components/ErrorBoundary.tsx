/**
 * ============================================================
 * ERROR BOUNDARY
 * Catches unhandled React render errors and shows a recovery UI.
 * Wraps each screen independently so one crash doesn't kill all tabs.
 * ============================================================
 */

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children:    React.ReactNode;
  screenName?: string;
}

interface State {
  hasError:  boolean;
  error:     Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[ErrorBoundary] Screen "${this.props.screenName}" crashed:`, error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 animate-fade-in">
        {/* Icon */}
        <div className="w-12 h-12 rounded-full bg-down/10 border border-down/30 flex items-center justify-center">
          <AlertTriangle size={22} className="text-down" />
        </div>

        {/* Message */}
        <div className="text-center max-w-md">
          <h3 className="font-mono text-sm font-semibold text-terminal-text mb-1">
            {this.props.screenName ? `Écran "${this.props.screenName}" planté` : "Erreur de rendu"}
          </h3>
          <p className="text-xs text-terminal-dim font-sans leading-relaxed">
            Une erreur inattendue s'est produite. Les autres onglets restent fonctionnels.
          </p>
        </div>

        {/* Error detail (dev mode) */}
        {import.meta.env.DEV && this.state.error && (
          <pre className="bg-terminal-surface border border-terminal-border rounded p-3 text-2xs font-mono text-down/80 max-w-lg overflow-auto max-h-32 w-full">
            {this.state.error.message}
            {"\n"}
            {this.state.errorInfo?.componentStack?.slice(0, 400)}
          </pre>
        )}

        {/* Retry */}
        <button
          onClick={this.handleRetry}
          className="flex items-center gap-2 text-xs font-mono text-terminal-accent border border-terminal-accent/40 hover:border-terminal-accent hover:bg-terminal-accent/10 px-4 py-2 rounded transition-colors"
        >
          <RefreshCw size={12} />
          Réessayer
        </button>
      </div>
    );
  }
}

/**
 * HOC convenience wrapper — wraps a screen component in ErrorBoundary.
 * Usage: export default withErrorBoundary(MyScreen, "MyScreen")
 */
export function withErrorBoundary<P extends object>(
  Component:  React.ComponentType<P>,
  screenName: string,
): React.FC<P> {
  const Wrapped: React.FC<P> = (props) => (
    <ErrorBoundary screenName={screenName}>
      <Component {...props} />
    </ErrorBoundary>
  );
  Wrapped.displayName = `WithErrorBoundary(${screenName})`;
  return Wrapped;
}
