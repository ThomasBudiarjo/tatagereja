import {
  MODULE_IDS,
  auditChanges,
  has,
  localize,
  moduleDefinition,
  type AuditLog,
  type ModuleId,
} from '@tatagereja/shared';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Braces, Download, FileClock, Globe, Hash, Monitor } from 'lucide-react';
import { useState } from 'react';
import { useChurch } from '@/components/layout/church-provider';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { FilterBar, type FilterDefinition } from '@/components/ui/filter-bar';
import { EmptyState, ErrorState } from '@/components/ui/misc';
import { InfiniteListFooter } from '@/components/ui/pagination';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { moduleManifest } from '@/features/registry';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { useUrlState } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import {
  auditEntryQuery,
  auditFacetsQuery,
  auditLogInfiniteQuery,
  useExportAuditLog,
} from '../api';
import { auditActionLabel, auditEntityLabel, auditHeadline } from '../components/audit-labels';
import { describeDevice } from '../components/device';
import { SettingsPage } from './layout';

/** Values in a diff: short text inline, objects as formatted JSON. */
function DiffValue({ value, tone }: { value: unknown; tone: 'before' | 'after' }) {
  const { t } = useI18n();
  if (value === null || value === undefined || value === '') {
    return (
      <span className="text-muted-foreground italic">{t('admin-security.auditEmptyValue')}</span>
    );
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    <span
      className={cn(
        'block rounded-md px-2 py-1 font-mono text-[12.5px] break-words whitespace-pre-wrap',
        tone === 'before'
          ? 'bg-destructive/[0.07] text-foreground line-through decoration-destructive/40'
          : 'bg-success/10 text-foreground',
      )}
    >
      {text}
    </span>
  );
}

function ModuleBadge({ module }: { module: string }) {
  const { locale } = useI18n();
  const known = (MODULE_IDS as readonly string[]).includes(module);
  const manifest = known ? moduleManifest(module as ModuleId) : undefined;
  return (
    <StatusBadge tone={manifest?.accent ?? 'neutral'} size="sm">
      {known ? localize(moduleDefinition(module as ModuleId).label, locale) : module}
    </StatusBadge>
  );
}

function AuditEntrySheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, locale, formatDate } = useI18n();
  const { churchId } = useChurch();
  const entry = useQuery({ ...auditEntryQuery(churchId, id), enabled: !!id });
  const [raw, setRaw] = useState(false);
  const data = entry.data?.entry;
  const changes = data ? auditChanges(data.before, data.after) : [];

  return (
    <Sheet open={!!id} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {data ? auditHeadline(data, locale, t) : t('admin-security.auditEntry')}
          </SheetTitle>
          <SheetDescription>
            {data ? formatDate(data.createdAt, 'dateTimeLong') : t('common.loading')}
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-5 pb-2">
          {entry.isPending ? (
            <SkeletonText lines={6} />
          ) : entry.isError ? (
            <ErrorState
              compact
              error={entry.error}
              message={getErrorMessage(entry.error)}
              onRetry={() => void entry.refetch()}
            />
          ) : data ? (
            <>
              <div className="flex items-center gap-3">
                <EntityAvatar name={data.actorName ?? '?'} size="sm" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold">
                    {data.actorName ?? t('admin-security.auditSystem')}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">{data.action}</p>
                </div>
                <ModuleBadge module={data.module} />
              </div>

              {locale !== 'en' ? (
                <section className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold">
                    {t('admin-security.auditStoredSummary')}
                  </h3>
                  <p lang="en" className="text-sm text-pretty text-muted-foreground">
                    {data.summary}
                  </p>
                </section>
              ) : null}

              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{t('admin-security.auditChanges')}</h3>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setRaw((value) => !value)}
                    aria-pressed={raw}
                  >
                    <Braces />
                    {raw ? t('admin-security.auditShowTable') : t('admin-security.auditShowRaw')}
                  </Button>
                </div>
                {raw ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(['before', 'after'] as const).map((side) => (
                      <div key={side} className="min-w-0">
                        <p className="text-overline mb-1 text-muted-foreground">
                          {t(
                            side === 'before'
                              ? 'admin-security.auditBefore'
                              : 'admin-security.auditAfter',
                          )}
                        </p>
                        <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs">
                          {JSON.stringify(data[side], null, 2) ?? 'null'}
                        </pre>
                      </div>
                    ))}
                  </div>
                ) : changes.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                    {t('admin-security.auditNoChanges')}
                  </p>
                ) : (
                  <ul className="flex flex-col divide-y divide-border/60 rounded-xl border border-border/70">
                    {changes.map((change) => (
                      <li key={change.field} className="flex flex-col gap-1.5 px-3 py-2.5">
                        <p className="font-mono text-xs font-semibold text-muted-foreground">
                          {change.field}
                        </p>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          <DiffValue value={change.before} tone="before" />
                          <DiffValue value={change.after} tone="after" />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <dl className="grid gap-2.5 text-sm">
                <div className="flex items-start gap-2.5">
                  <Hash className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <dt className="sr-only">{t('admin-security.auditEntity')}</dt>
                  <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                    <span>{auditEntityLabel(data.entityType, t)}</span>
                    {data.entityId ? (
                      <>
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          {data.entityId}
                        </span>
                        <CopyButton value={data.entityId} iconOnly variant="ghost" />
                      </>
                    ) : null}
                  </dd>
                </div>
                {data.ip ? (
                  <div className="flex items-center gap-2.5">
                    <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <dt className="sr-only">{t('admin-security.ipAddress')}</dt>
                    <dd className="font-mono text-xs">{data.ip}</dd>
                  </div>
                ) : null}
                {data.userAgent ? (
                  <div className="flex items-center gap-2.5">
                    <Monitor className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <dt className="sr-only">{t('admin-security.device')}</dt>
                    <dd className="truncate" title={data.userAgent}>
                      {describeDevice(data.userAgent, t)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </>
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

const dayKey = (iso: string, timeZone?: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));

export function AuditLogPage() {
  const { t, locale, formatDate, formatTime, formatNumber, timeZone } = useI18n();
  const { churchId, access } = useChurch();
  const [state, setState, reset] = useUrlState({
    q: '',
    module: '',
    action: '',
    actor: '',
    entity: '',
    from: '',
    to: '',
    entry: '',
  });
  const filters = {
    q: state.q || undefined,
    module: (MODULE_IDS as readonly string[]).includes(state.module)
      ? (state.module as ModuleId)
      : undefined,
    action: state.action || undefined,
    actorUserId: state.actor || undefined,
    entityType: state.entity || undefined,
    fromDate: state.from || undefined,
    toDate: state.to || undefined,
  };
  const list = useInfiniteQuery({
    ...auditLogInfiniteQuery(churchId, filters),
    placeholderData: keepPreviousData,
  });
  const facets = useQuery(auditFacetsQuery(churchId));
  const exportCsv = useMutationToast(useExportAuditLog(churchId), {
    success: t('admin-security.auditExported'),
  });
  const filtering = Object.values(filters).some(Boolean);
  const entries = list.data?.pages.flatMap((page) => page.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;

  const filterDefs: FilterDefinition[] = [
    {
      id: 'module',
      label: t('admin-security.auditModule'),
      value: state.module,
      onChange: (value) => setState({ module: value }),
      options: (facets.data?.modules ?? []).map((module) => ({
        value: module,
        label: localize(moduleDefinition(module).label, locale),
      })),
    },
    {
      id: 'actor',
      label: t('admin-security.auditActor'),
      value: state.actor,
      onChange: (value) => setState({ actor: value }),
      options: (facets.data?.actors ?? []).map((actor) => ({ value: actor.id, label: actor.name })),
    },
    {
      id: 'action',
      label: t('admin-security.auditAction'),
      value: state.action,
      onChange: (value) => setState({ action: value }),
      options: (facets.data?.actions ?? []).map((action) => ({
        value: action,
        label: auditActionLabel(action, action.split('.')[0] ?? action, t),
      })),
    },
    {
      id: 'entity',
      label: t('admin-security.auditEntity'),
      value: state.entity,
      onChange: (value) => setState({ entity: value }),
      options: (facets.data?.entityTypes ?? []).map((type) => ({
        value: type,
        label: auditEntityLabel(type, t),
      })),
    },
  ];

  // Entries grouped under a heading per calendar day in the church time zone.
  const groups: { day: string; items: AuditLog[] }[] = [];
  for (const entry of entries) {
    const day = dayKey(entry.createdAt, timeZone);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(entry);
    else groups.push({ day, items: [entry] });
  }

  return (
    <SettingsPage
      section="audit"
      description={
        list.data
          ? t('admin-security.auditCount', { count: formatNumber(total) })
          : t('admin-security.auditDescription')
      }
      actions={
        has(access, 'audit.export') ? (
          <Button
            size="sm"
            variant="outline"
            loading={exportCsv.isPending}
            onClick={() => void exportCsv.run(filters)}
          >
            {!exportCsv.isPending ? <Download /> : null}
            {t('admin-security.exportCsv')}
          </Button>
        ) : null
      }
    >
      <FilterBar
        search={{
          value: state.q,
          onChange: (value) => setState({ q: value }),
          placeholder: t('admin-security.auditSearch'),
        }}
        filters={filterDefs}
        actions={
          <DateRangePicker
            value={{ from: state.from, to: state.to }}
            onChange={(range) => setState({ from: range.from, to: range.to })}
            className="hidden shrink-0 sm:inline-flex"
          />
        }
        onReset={() => reset(['entry'])}
      />
      <DateRangePicker
        value={{ from: state.from, to: state.to }}
        onChange={(range) => setState({ from: range.from, to: range.to })}
        className="w-full sm:hidden"
      />

      {list.isPending ? (
        <SkeletonList rows={8} />
      ) : list.isError ? (
        <ErrorState
          error={list.error}
          message={getErrorMessage(list.error)}
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={FileClock}
          tone="indigo"
          title={filtering ? t('common.noResults') : t('admin-security.auditEmpty')}
          description={filtering ? t('common.noResultsHint') : t('admin-security.auditEmptyHint')}
          action={
            filtering ? (
              <Button variant="outline" onClick={() => reset(['entry'])}>
                {t('common.clearAll')}
              </Button>
            ) : null
          }
        />
      ) : (
        <div
          className={cn(
            'flex flex-col gap-5 transition-opacity',
            list.isPlaceholderData && 'opacity-60',
          )}
        >
          {groups.map((group) => (
            <section key={group.day} className="flex flex-col gap-2">
              <h2 className="text-overline sticky top-16 z-10 -mx-1 w-fit rounded-full bg-background/90 px-2 py-1 text-muted-foreground backdrop-blur md:top-2">
                {formatDate(group.day, 'dateLong')}
              </h2>
              <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
                {group.items.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => setState({ entry: entry.id }, { push: true })}
                      className="group flex min-h-16 w-full items-start gap-3 px-4 py-3 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:ring-inset"
                    >
                      <EntityAvatar name={entry.actorName ?? '?'} size="sm" className="mt-0.5" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-pretty">
                          {auditHeadline(entry, locale, t)}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/80">
                            {entry.actorName ?? t('admin-security.auditSystem')}
                          </span>
                          <ModuleBadge module={entry.module} />
                          <span className="hidden font-mono sm:inline">{entry.action}</span>
                        </span>
                      </span>
                      <time
                        dateTime={entry.createdAt}
                        className="shrink-0 pt-0.5 text-xs text-muted-foreground tabular"
                      >
                        {formatTime(entry.createdAt)}
                      </time>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <InfiniteListFooter
            hasNextPage={!!list.hasNextPage}
            isFetchingNextPage={list.isFetchingNextPage}
            fetchNextPage={list.fetchNextPage}
          />
        </div>
      )}
      <AuditEntrySheet id={state.entry} onClose={() => setState({ entry: '' })} />
    </SettingsPage>
  );
}
