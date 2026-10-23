import {
  REGISTRY_RECORD_STATUS_LABELS,
  REGISTRY_RECORD_TYPES,
  canManageRecords,
  canViewRegistry,
  hasAny,
  isModuleEnabled,
  localize,
  recordTypeText,
  type PersonRecordItem,
  type RecordSideEffect,
  type RegistryRecordStatus,
  type RegistryRecordType,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Ban, CheckCircle2, ChevronDown, Plus, ScrollText } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, NavLink } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Section } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { DataList } from '@/components/ui/data-list';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonList } from '@/components/ui/skeleton';
import { StatusBadge, ToneIcon } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { personRecordsQuery } from './api';
import {
  RECORDS_TONE,
  RECORD_TYPE_META,
  SIDE_EFFECT_KEYS,
  recordTitle,
  roleLabelKey,
  useEffectValue,
} from './records-lib';

/** The coloured icon chip of a record type. */
export function RecordTypeIcon({
  type,
  size = 'md',
  className,
}: {
  type: RegistryRecordType;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const meta = RECORD_TYPE_META[type];
  return <ToneIcon icon={meta.icon} tone={meta.tone} size={size} className={className} />;
}

export function RecordTypeBadge({
  record,
  size = 'sm',
}: {
  record: { type: RegistryRecordType; subtype: string | null };
  size?: 'sm' | 'md';
}) {
  const { locale } = useI18n();
  const meta = RECORD_TYPE_META[record.type];
  return (
    <StatusBadge tone={meta.tone} size={size} icon={meta.icon}>
      {recordTypeText(record, locale)}
    </StatusBadge>
  );
}

export function RecordStatusBadge({
  status,
  size = 'sm',
}: {
  status: RegistryRecordStatus;
  size?: 'sm' | 'md';
}) {
  const { locale } = useI18n();
  return (
    <StatusBadge
      tone={status === 'active' ? 'success' : 'danger'}
      size={size}
      icon={status === 'active' ? CheckCircle2 : Ban}
    >
      {localize(REGISTRY_RECORD_STATUS_LABELS[status], locale)}
    </StatusBadge>
  );
}

/** The record number in a monospace chip, as it is printed in the register. */
export function RecordNumber({ number, className }: { number: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-md bg-muted px-2 font-mono text-xs font-semibold tracking-tight tabular whitespace-nowrap text-foreground/85',
        className,
      )}
    >
      {number}
    </span>
  );
}

/** "Budi Santoso · Status keanggotaan: Simpatisan → Anggota" */
export function SideEffectList({
  effects,
  className,
}: {
  effects: readonly RecordSideEffect[];
  className?: string;
}) {
  const { t } = useI18n();
  const valueOf = useEffectValue();
  return (
    <ul className={cn('flex flex-col gap-2', className)}>
      {effects.map((effect) => (
        <li
          key={`${effect.personId}-${effect.kind}`}
          className="flex flex-col gap-0.5 rounded-lg border border-border/70 bg-sunken/60 px-3 py-2 text-sm"
        >
          <span className="font-medium">
            {effect.name} · {t(SIDE_EFFECT_KEYS[effect.kind])}
          </span>
          <span className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
            <span className={cn(effect.from === null && 'italic')}>
              {valueOf(effect, effect.from)}
            </span>
            <ArrowRight className="size-3.5" aria-label={t('records.effectBecomes')} />
            <span className="font-semibold text-foreground">{valueOf(effect, effect.to)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The rows of a person's records (their own list, or the person page). */
export function PersonRecordList({ items }: { items: PersonRecordItem[] }) {
  const { base } = useChurch();
  const { t, formatDate } = useI18n();
  return (
    <DataList
      items={items}
      getKey={(item) => item.id}
      href={(item) => `${base}/records/${item.id}`}
      leading={(item) => <RecordTypeIcon type={item.type} />}
      title={(item) => (
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate">{recordTitle(item)}</span>
          {item.status === 'voided' ? <RecordStatusBadge status="voided" /> : null}
        </span>
      )}
      subtitle={(item) =>
        [
          formatDate(item.date, 'dateShort'),
          item.place,
          item.role === 'subject' || item.role === 'spouse'
            ? null
            : t(roleLabelKey(item.type, item.role)),
        ]
          .filter(Boolean)
          .join(' · ')
      }
      trailing={(item) => (
        <span className="hidden flex-col items-end gap-1 sm:flex">
          <RecordTypeBadge record={item} />
          <RecordNumber number={item.number} />
        </span>
      )}
    />
  );
}

/**
 * The church registry records naming one person, for the person page: register viewers see
 * every record the person appears on, the person their own. Renders nothing for anyone else.
 */
export function PersonRecordsCard({ personId, isSelf }: { personId: string; isSelf: boolean }) {
  const { churchId, base, access, church } = useChurch();
  const { t } = useI18n();
  const allowed =
    isModuleEnabled(church.enabledModules, 'records') && (canViewRegistry(access) || isSelf);
  const query = useQuery({ ...personRecordsQuery(churchId, personId), enabled: allowed });
  if (!allowed) return null;
  return (
    <Section
      title={t('records.personSection')}
      icon={ScrollText}
      action={
        canViewRegistry(access) ? (
          <Button asChild variant="ghost" size="sm">
            <Link to={`${base}/records/register?personId=${personId}`}>{t('common.seeAll')}</Link>
          </Button>
        ) : null
      }
    >
      {query.isPending ? (
        <SkeletonList rows={2} />
      ) : query.isError ? (
        <ErrorState
          compact
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          compact
          icon={ScrollText}
          tone={RECORDS_TONE}
          title={t('records.personEmpty')}
          description={t('records.personEmptyBody')}
        />
      ) : (
        <PersonRecordList items={query.data.items} />
      )}
    </Section>
  );
}

/** The module's section strip: overview, register book, own records and settings. */
export function RecordsNav() {
  const { base, access } = useChurch();
  const { t } = useI18n();
  const items: { to: string; label: MessageKey; end?: boolean }[] = [
    ...(canViewRegistry(access)
      ? [
          { to: `${base}/records`, label: 'records.tabOverview' as const, end: true },
          { to: `${base}/records/register`, label: 'records.tabRegister' as const },
        ]
      : []),
    ...(access.personId ? [{ to: `${base}/records/mine`, label: 'records.tabMine' as const }] : []),
    ...(hasAny(access, ['records.manage', 'settings.manage'])
      ? [{ to: `${base}/records/settings`, label: 'records.tabSettings' as const }]
      : []),
  ];
  const ref = useRef<HTMLElement>(null);
  // On phones the strip scrolls; keep the current section in view.
  useEffect(() => {
    ref.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, []);
  if (items.length < 2) return null;
  return (
    <nav
      ref={ref}
      aria-label={t('records.sectionNav')}
      data-print="hide"
      className="-mx-4 -mt-1 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0"
    >
      <ul className="flex w-max gap-1 rounded-xl bg-muted p-1">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex h-9 items-center rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition-all duration-200 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                  isActive
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {t(item.label)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** "Catat baru" with a menu of every kind of record; only for registry managers. */
export function NewRecordMenu({ size = 'sm', label }: { size?: 'sm' | 'default'; label?: string }) {
  const { base, access } = useChurch();
  const { t } = useI18n();
  if (!canManageRecords(access)) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size}>
          <Plus />
          <span className={cn(!label && 'hidden sm:inline')}>
            {label ?? t('records.newRecord')}
          </span>
          {!label ? <span className="sm:hidden">{t('common.add')}</span> : null}
          <ChevronDown className="opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{t('records.chooseType')}</DropdownMenuLabel>
        {REGISTRY_RECORD_TYPES.map((type) => {
          const meta = RECORD_TYPE_META[type];
          return (
            <DropdownMenuItem key={type} asChild>
              <Link to={`${base}/records/new?type=${type}`}>
                <span data-tone={meta.tone} className="text-tone-ink">
                  <meta.icon className="size-4 text-tone-ink" />
                </span>
                {t(meta.newKey)}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
