import { useQuery } from '@tanstack/react-query';
import { Church, ChevronRight, Link2, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { EntityAvatar } from '@/components/ui/avatar';
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
import { EmptyState, ErrorState } from '@/components/ui/misc';
import { SkeletonList } from '@/components/ui/skeleton';
import { StatusBadge, ToneIcon } from '@/components/ui/status-badge';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { ROLE_KEYS } from '@/lib/i18n/labels';
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
  const { t } = useI18n();
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const token = extractInvitationToken(value);
    if (!token) {
      setError(t('churches.joinInvalid'));
      return;
    }
    onOpenChange(false);
    navigate(`/join/${encodeURIComponent(token)}`);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('churches.joinDialogTitle')}</DialogTitle>
          <DialogDescription>{t('churches.joinDialogDescription')}</DialogDescription>
        </DialogHeader>
        <Field label={t('churches.joinField')} htmlFor="invite" error={error ?? undefined}>
          <Input
            id="invite"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            placeholder="https://…/join/abc123"
            autoCapitalize="none"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
            }}
          />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit}>{t('common.continue')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ChurchesPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const churches = useQuery(myChurchesQuery());
  const [joinOpen, setJoinOpen] = useState(false);

  const tileClass =
    'pressable flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 text-left shadow-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40';

  return (
    <Page>
      <PageHeader
        eyebrow={user ? t('churches.hello', { name: user.name.split(' ')[0] ?? '' }) : undefined}
        title={t('churches.title')}
        description={t('churches.description')}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/churches/new" className={tileClass}>
          <ToneIcon icon={Plus} tone="brand" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{t('churches.createTitle')}</span>
            <span className="block text-sm text-muted-foreground">{t('churches.createHint')}</span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground/60" aria-hidden />
        </Link>
        <button type="button" className={tileClass} onClick={() => setJoinOpen(true)}>
          <ToneIcon icon={Link2} tone="sky" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{t('churches.joinTitle')}</span>
            <span className="block text-sm text-muted-foreground">{t('churches.joinHint')}</span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground/60" aria-hidden />
        </button>
      </div>
      <Section title={t('churches.yourChurches')}>
        {churches.isPending ? (
          <SkeletonList rows={3} />
        ) : churches.isError ? (
          <ErrorState
            error={churches.error}
            message={getErrorMessage(churches.error)}
            onRetry={() => void churches.refetch()}
            retrying={churches.isFetching}
          />
        ) : churches.data.items.length === 0 ? (
          <EmptyState
            icon={Church}
            title={t('churches.emptyTitle')}
            description={t('churches.emptyDescription')}
            action={
              <Button asChild>
                <Link to="/churches/new">
                  <Plus /> {t('churches.createTitle')}
                </Link>
              </Button>
            }
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
                subtitle={[t('churches.accounts', { count: item.memberCount }), item.church.city]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={
                  item.status === 'suspended' ? (
                    <StatusBadge tone="danger">{t('common.statusSuspended')}</StatusBadge>
                  ) : (
                    <StatusBadge tone={item.role === 'member' ? 'neutral' : 'brand'}>
                      {t(ROLE_KEYS[item.role])}
                    </StatusBadge>
                  )
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
