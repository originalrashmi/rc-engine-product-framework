import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="max-w-md rounded-lg border border-red-800 bg-red-900/20 p-8 text-center">
            <AlertTriangle size={48} className="mx-auto mb-4 text-red-400" />
            <h2 className="mb-2 text-lg font-semibold text-red-300">Something went wrong</h2>
            <p className="mb-4 font-mono text-sm text-red-400/80">{this.state.error?.message || 'Unknown error'}</p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 rounded bg-red-800 px-4 py-2 text-sm font-medium text-red-100 hover:bg-red-700"
            >
              <RefreshCw size={14} />
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
