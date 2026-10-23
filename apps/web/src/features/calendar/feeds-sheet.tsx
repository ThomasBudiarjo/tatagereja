import {
  CALENDAR_SOURCE_LABELS,
  COMMS_LIMITS,
  localize,
  type CalendarFeed,
  type CalendarSource,
  type CreatedCalendarFeed,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, KeyRound, Link2, Smartphone, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useChurch } from '@/components/layout/church-provider';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CopyButton } from '@/components/ui/copy-button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { QrDisplay } from '@/components/ui/qr-code';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { SkeletonList } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { useServerStore } from '@/stores/server';
import { feedsQuery, useCreateFeed, useRevokeFeed } from './api';
import { SOURCE_ICONS } from './calendar-lib';

/**
 * Private calendar links for phone and desktop calendar apps. The link is the key: it is shown
 * once after creating, and revoking it stops the feed at once.
 */
export function FeedsSheet({
  open,
  onOpenChange,
  available,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  available: readonly CalendarSource[];
}) {
  const { t, locale, formatRelative } = useI18n();
  const { churchId } = useChurch();
  const serverUrl = useServerStore((state) => state.currentUrl);
  const feeds = useQuery({ ...feedsQuery(churchId), enabled: open });
  const [label, setLabel] = useState('');
  const [sources, setSources] = useState<CalendarSource[]>(['events', 'services']);
  const [created, setCreated] = useState<CreatedCalendarFeed | null>(null);
  const [revoking, setRevoking] = useState<CalendarFeed | null>(null);
  const create = useMutationToast(useCreateFeed(churchId), { success: t('comms.feedCreated') });
  const revoke = useMutationToast(useRevokeFeed(churchId), { success: t('comms.feedRevoked') });
  const chosen = sources.filter((source) => available.includes(source));
  const url = created ? `${serverUrl.replace(/\/+$/, '')}${created.path}` : '';
  const webcal = url.replace(/^https?:/, 'webcal:');
  const count = feeds.data?.items.length ?? 0;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setCreated(null);
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('comms.feedsTitle')}</SheetTitle>
          <SheetDescription>{t('comms.feedsDescription')}</SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-5">
          {created ? (
            <div className="flex animate-rise-in flex-col gap-3 rounded-xl border border-primary/25 bg-accent/40 p-4">
              <p className="flex items-center gap-2 font-semibold">
                <KeyRound className="size-4" aria-hidden />
                {t('comms.feedReady')}
              </p>
              <p className="text-sm text-muted-foreground">{t('comms.feedOnce')}</p>
              <Input
                readOnly
                value={url}
                onFocus={(event) => event.target.select()}
                aria-label={t('comms.feedUrl')}
              />
              <div className="flex flex-wrap gap-2">
                <CopyButton value={url} label={t('comms.copyLink')} />
                <Button asChild size="sm" variant="outline">
                  <a href={webcal}>
                    <Smartphone />
                    {t('comms.addToPhone')}
                  </a>
                </Button>
              </div>
              <QrDisplay
                value={webcal}
                size={160}
                caption={t('comms.feedQr')}
                className="self-center"
              />
            </div>
          ) : null}

          <form
            className="flex flex-col gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const result = await create.run({ label: label || null, sources: chosen });
              if (result) {
                setCreated(result);
                setLabel('');
              }
            }}
          >
            <h3 className="text-sm font-semibold">{t('comms.feedNew')}</h3>
            <Field
              label={t('comms.feedLabel')}
              htmlFor="feed-label"
              description={t('comms.feedLabelHint')}
            >
              <Input
                id="feed-label"
                value={label}
                maxLength={60}
                onChange={(event) => setLabel(event.target.value)}
              />
            </Field>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">{t('comms.feedSources')}</legend>
              {available.map((source) => {
                const Icon = SOURCE_ICONS[source];
                return (
                  <label
                    key={source}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm"
                  >
                    <Checkbox
                      checked={sources.includes(source)}
                      onCheckedChange={(checked) =>
                        setSources((current) =>
                          checked
                            ? [...current, source]
                            : current.filter((item) => item !== source),
                        )
                      }
                    />
                    <Icon className="size-4 text-muted-foreground" aria-hidden />
                    {localize(CALENDAR_SOURCE_LABELS[source], locale)}
                  </label>
                );
              })}
            </fieldset>
            <Button
              type="submit"
              loading={create.isPending}
              disabled={chosen.length === 0 || count >= COMMS_LIMITS.feedTokensPerUserMax}
              className="w-full sm:w-fit"
            >
              <CalendarPlus />
              {t('comms.feedCreate')}
            </Button>
            {count >= COMMS_LIMITS.feedTokensPerUserMax ? (
              <Alert variant="warning">
                {t('comms.feedLimit', { count: COMMS_LIMITS.feedTokensPerUserMax })}
              </Alert>
            ) : null}
          </form>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t('comms.feedActive')}</h3>
            {feeds.isPending ? (
              <SkeletonList rows={2} avatar={false} />
            ) : feeds.isError ? (
              <ErrorState
                compact
                error={feeds.error}
                message={getErrorMessage(feeds.error)}
                onRetry={() => void feeds.refetch()}
              />
            ) : feeds.data.items.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
                {t('comms.feedNone')}
              </p>
            ) : (
              <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70">
                {feeds.data.items.map((feed) => (
                  <li key={feed.id} className="flex min-h-14 items-center gap-3 px-3.5 py-2">
                    <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {feed.label ?? t('comms.feedUnnamed')}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {feed.sources
                          .map((source) => localize(CALENDAR_SOURCE_LABELS[source], locale))
                          .join(', ')}
                        {' · '}
                        {feed.lastUsedAt
                          ? t('comms.feedUsed', { when: formatRelative(feed.lastUsedAt) })
                          : t('comms.feedNeverUsed')}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      aria-label={t('comms.feedRevoke')}
                      onClick={() => setRevoking(feed)}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </SheetBody>
      </SheetContent>
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(next) => (!next ? setRevoking(null) : undefined)}
        title={t('comms.feedRevokeTitle')}
        description={t('comms.feedRevokeBody')}
        confirmLabel={t('comms.feedRevoke')}
        loading={revoke.isPending}
        onConfirm={async () => {
          if (revoking && (await revoke.run(revoking.id))) setRevoking(null);
        }}
      />
    </Sheet>
  );
}
