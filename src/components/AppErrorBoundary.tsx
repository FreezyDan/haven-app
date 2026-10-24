import { Component, type ReactNode } from 'react';

/**
 * Last-resort safety net: a render error anywhere in the app used to unmount
 * the whole tree and leave a blank page. Instead, show a calm fallback and
 * offer a reload.
 */
export default class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('App render error:', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-haven-canvas px-6 text-center">
        <h1 className="font-serif text-2xl font-medium text-haven-text">
          Something went quiet on our side.
        </h1>
        <p className="mt-2 max-w-sm text-sm text-haven-text-muted">
          The page hit an unexpected error. A quick reload usually brings it back.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 rounded-full bg-haven-primary px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-haven-primary-hover"
        >
          Reload Haven
        </button>
      </div>
    );
  }
}
