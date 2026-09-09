import { ROLE_LABELS } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { Church, Link2, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { EntityAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ListGroup, ListRow } from '@/components/ui/list';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/misc';
import { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { myChurchesQuery } from './api';

function extractInvitationToken(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\/join\/([^/?#]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]);
  if (/^[A-Za-z0-9_-]{8,}$/.test(trimmed)) return trimmed;
  return null;
}

function JoinDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const token = extractInvitationToken(value);
    if (!token) {
      setError('Paste the invitation link or code you received');
      return;
    }
    onOpenChange(false);
    navigate(`/join/${encodeURIComponent(token)}`);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join a church</DialogTitle>
          <DialogDescription>
            Paste the invitation link or code from your church administrator. You can also scan
            their QR code with your camera.
          </DialogDescription>
        </DialogHeader>
        <Field label="Invitation link or code" htmlFor="invite" error={error ?? undefined}>
          <Input
            id="invite"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            placeholder="https://…/join/abc123"
            autoCapitalize="none"
          />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ChurchesPage() {
  const { user } = useAuth();
  const churches = useQuery(myChurchesQuery());
  const [joinOpen, setJoinOpen] = useState(false);

  return (
    <Page>
      <PageHeader
        eyebrow={user ? `Hello, ${user.name.split(' ')[0]}` : undefined}
        title="My churches"
        description="Choose a church to open, create a new one, or join with an invitation."
      />
      <div className="grid grid-cols-2 gap-3">
        <Button asChild variant="outline" className="h-auto flex-col gap-1 py-4">
          <Link to="/churches/new">
            <Plus className="size-5" />
            Create a church
          </Link>
        </Button>
        <Button
          variant="outline"
          className="h-auto flex-col gap-1 py-4"
          onClick={() => setJoinOpen(true)}
        >
          <Link2 className="size-5" />
          Join with a link
        </Button>
      </div>
      <Section title="Your churches">
        {churches.isPending ? (
          <PageLoader />
        ) : churches.isError ? (
          <ErrorState
            message={getErrorMessage(churches.error)}
            onRetry={() => void churches.refetch()}
          />
        ) : churches.data.items.length === 0 ? (
          <EmptyState
            icon={Church}
            title="You are not part of a church yet"
            description="Create a church to become its owner, or join one using an invitation link or QR code."
          />
        ) : (
          <ListGroup>
            {churches.data.items.map((item) => (
              <ListRow
                key={item.church.id}
                to={`/c/${item.church.id}`}
                leading={
                  <EntityAvatar
                    name={item.church.name}
                    src={item.church.logoUrl}
                    color={item.church.brandColor}
                    square
                  />
                }
                title={item.church.name}
                subtitle={`${item.memberCount} ${item.memberCount === 1 ? 'account' : 'accounts'}${item.church.city ? ` · ${item.church.city}` : ''}`}
                trailing={
                  <Badge variant={item.role === 'member' ? 'muted' : 'secondary'}>
                    {ROLE_LABELS[item.role]}
                  </Badge>
                }
              />
            ))}
          </ListGroup>
        )}
      </Section>
      <JoinDialog
        open={joinOpen}
        onOpenChange={(open) => {
          setJoinOpen(open);
          if (!open) toast.dismiss();
        }}
      />
    </Page>
  );
}
