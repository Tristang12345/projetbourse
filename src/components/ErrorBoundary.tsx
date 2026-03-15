/**
 * ErrorBoundary — Capture les erreurs React et affiche
 * un message d'erreur au lieu d'un écran blanc/noir.
 */

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children:   React.ReactNode;
  screenName?: string;
}
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary] Erreur dans "${this.props.screenName}":`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-terminal-dim p-8">
          <AlertTriangle size={32} className="text-down opacity-60" />
          <div className="text-center">
            <p className="font-mono text-sm text-terminal-text mb-1">
              Erreur dans {this.props.screenName ?? "l'écran"}
            </p>
            <p className="font-mono text-2xs text-terminal-dim max-w-md">
              {this.state.error?.message}
            </p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-2 text-2xs font-mono text-terminal-accent border border-terminal-accent/40 px-3 py-1.5 rounded hover:bg-terminal-accent/10 transition-colors"
          >
            <RefreshCw size={10} /> Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
