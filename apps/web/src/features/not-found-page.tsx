import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-5xl font-bold tracking-tight">404</p>
      <p className="text-sm text-muted-foreground">We could not find that page.</p>
      <Button asChild>
        <Link to="/">Go home</Link>
      </Button>
    </div>
  );
}
