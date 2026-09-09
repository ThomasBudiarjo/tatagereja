import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Catches render errors so a broken screen never leaves a blank page. */
export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The app hit an unexpected error. Reloading usually fixes it.
        </p>
        <Button onClick={() => window.location.reload()}>Reload the app</Button>
      </div>
    );
  }
}
