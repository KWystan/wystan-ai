import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white p-8">
          <div className="max-w-md w-full">
            <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center mb-4 mx-auto">
              <span className="material-symbols-outlined text-red-500 text-[24px]">error</span>
            </div>
            <h2 className="text-lg font-semibold text-black text-center mb-2">Something went wrong</h2>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-700 font-mono whitespace-pre-wrap break-all">
              {this.state.error.message || String(this.state.error)}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 w-full py-2.5 rounded-xl bg-black text-white text-sm font-medium hover:bg-black/85 active:scale-[0.98] transition-all duration-150"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
