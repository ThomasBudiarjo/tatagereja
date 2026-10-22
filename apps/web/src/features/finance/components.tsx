import {
  EXPENSE_STATUS_LABELS,
  OFFERING_BATCH_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  fullName,
  hasAny,
  localize,
  type ExpenseStatus,
  type OfferingBatchStatus,
  type PaymentMethod,
  type Permission,
  type PersonSummary,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { Settings2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { NavLink } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Combobox } from '@/components/ui/combobox';
import { Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import type { Tone } from '@/components/ui/tone';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { donorsQuery, membersQuery } from './api';
import { EXPENSE_STATUS_TONE, METHOD_ICON, OFFERING_STATUS_TONE } from './helpers';

export function OfferingStatusBadge({ status }: { status: OfferingBatchStatus }) {
  const { locale } = useI18n();
  return (
    <StatusBadge tone={OFFERING_STATUS_TONE[status]} dot>
      {localize(OFFERING_BATCH_STATUS_LABELS[status], locale)}
    </StatusBadge>
  );
}

export function ExpenseStatusBadge({ status }: { status: ExpenseStatus }) {
  const { locale } = useI18n();
  return (
    <StatusBadge tone={EXPENSE_STATUS_TONE[status]} dot>
      {localize(EXPENSE_STATUS_LABELS[status], locale)}
    </StatusBadge>
  );
}

export function MethodLabel({ method, className }: { method: PaymentMethod; className?: string }) {
  const { locale } = useI18n();
  const Icon = METHOD_ICON[method];
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <Icon className="size-3.5 text-muted-foreground" aria-hidden />
      {localize(PAYMENT_METHOD_LABELS[method], locale)}
    </span>
  );
}

/** An amount in the church currency; signed amounts are coloured in and out. */
export function Money({
  value,
  signed = false,
  className,
}: {
  value: number | null | undefined;
  signed?: boolean;
  className?: string;
}) {
  const { formatCurrency } = useI18n();
  if (value === null || value === undefined) return <span className={className}>—</span>;
  return (
    <span
      className={cn(
        'font-semibold whitespace-nowrap tabular',
        signed && value > 0 && 'text-success',
        signed && value < 0 && 'text-destructive',
        className,
      )}
    >
      {formatCurrency(value, { signDisplay: signed ? 'exceptZero' : 'auto' })}
    </span>
  );
}

/** A slim progress bar (campaigns, pledges, budget usage). */
export function Meter({
  value,
  tone = 'emerald',
  label,
  className,
}: {
  /** 0..1; above 1 shows as full in the warning tone. */
  value: number;
  tone?: Tone;
  label: string;
  className?: string;
}) {
  const over = value > 1;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(value, 9.99) * 100)}
      data-tone={over ? 'danger' : tone}
      className={cn('h-2 overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className="h-full rounded-full bg-tone transition-[width] duration-500 motion-reduce:transition-none"
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}

const SECTIONS: {
  to: string;
  labelKey: MessageKey;
  anyOf: readonly Permission[];
  end?: boolean;
}[] = [
  {
    to: 'finance',
    labelKey: 'finance.navOverview',
    anyOf: [
      'finance.view',
      'finance.record',
      'finance.approve',
      'finance.manage',
      'finance.reports',
    ],
    end: true,
  },
  {
    to: 'finance/offerings',
    labelKey: 'finance.navOfferings',
    anyOf: ['finance.view', 'finance.record', 'finance.approve'],
  },
  { to: 'finance/giving', labelKey: 'finance.navGiving', anyOf: ['finance.view'] },
  {
    to: 'finance/expenses',
    labelKey: 'finance.navExpenses',
    anyOf: ['finance.view', 'finance.record', 'finance.approve', 'finance.manage'],
  },
  { to: 'finance/ledger', labelKey: 'finance.navLedger', anyOf: ['finance.view'] },
  {
    to: 'finance/budget',
    labelKey: 'finance.navBudget',
    anyOf: ['finance.view', 'finance.reports'],
  },
  {
    to: 'finance/campaigns',
    labelKey: 'finance.navCampaigns',
    anyOf: ['finance.view', 'finance.record', 'finance.reports'],
  },
  { to: 'finance/reports', labelKey: 'finance.navReports', anyOf: ['finance.reports'] },
  { to: 'finance/periods', labelKey: 'finance.navPeriods', anyOf: ['finance.manage'] },
];

/** The finance sections the caller may open, as a scrollable row of pills. */
export function FinanceNav({ className }: { className?: string }) {
  const { t } = useI18n();
  const { access, base } = useChurch();
  const items = SECTIONS.filter((section) => hasAny(access, section.anyOf));
  if (items.length <= 1) return null;
  return (
    <nav
      aria-label={t('finance.nav')}
      data-print="hide"
      className={cn(
        '-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-0.5 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0',
        className,
      )}
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={`${base}/${item.to}`}
          end={item.end}
          className={({ isActive }) =>
            cn(
              'inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
              isActive
                ? 'bg-foreground text-background'
                : 'bg-card text-muted-foreground ring-1 ring-border/70 hover:bg-muted hover:text-foreground',
            )
          }
        >
          {t(item.labelKey)}
        </NavLink>
      ))}
      {hasAny(access, ['finance.manage']) ? (
        <NavLink
          to={`${base}/finance/settings`}
          aria-label={t('finance.navSettings')}
          className={({ isActive }) =>
            cn(
              'inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
              isActive
                ? 'bg-foreground text-background'
                : 'bg-card text-muted-foreground ring-1 ring-border/70 hover:bg-muted hover:text-foreground',
            )
          }
        >
          <Settings2 className="size-4" />
        </NavLink>
      ) : null}
    </nav>
  );
}

/** Searches the church directory for a giver, pledger or reimbursed person. */
export function PersonCombobox({
  id,
  value,
  onChange,
  selected,
  placeholder,
  invalid,
}: {
  id?: string;
  value: string | null;
  onChange: (value: string | null, person: PersonSummary | null) => void;
  /** The current person, so their name shows before any search. */
  selected?: PersonSummary | null;
  placeholder?: string;
  invalid?: boolean;
}) {
  const { t } = useI18n();
  const { churchId } = useChurch();
  const [search, setSearch] = useState('');
  const [known, setKnown] = useState<Map<string, PersonSummary>>(
    () => new Map(selected ? [[selected.id, selected]] : []),
  );
  const query = useQuery(donorsQuery(churchId, search));
  const people = useMemo(() => {
    const map = new Map(known);
    for (const person of query.data?.items ?? []) map.set(person.id, person);
    return map;
  }, [known, query.data]);
  const visible = query.data?.items ?? [];
  const current = value ? people.get(value) : undefined;
  const options = [
    ...(current && !visible.some((p) => p.id === current.id) ? [current] : []),
    ...visible,
  ];
  return (
    <Combobox
      id={id}
      value={value}
      clearable
      aria-invalid={invalid}
      placeholder={placeholder ?? t('finance.choosePerson')}
      searchPlaceholder={t('finance.searchPeople')}
      emptyText={t('finance.noPeopleFound')}
      loading={query.isFetching}
      onSearchChange={setSearch}
      options={options.map((person) => ({
        value: person.id,
        label: fullName(person),
        leading: <EntityAvatar name={fullName(person)} src={person.photoUrl} size="xs" />,
      }))}
      onChange={(next) => {
        const person = next ? (people.get(next) ?? null) : null;
        if (person) setKnown((map) => new Map(map).set(person.id, person));
        onChange(next, person);
      }}
    />
  );
}

/** Picks a church member (a counter) by account. */
export function MemberCombobox({
  id,
  value,
  onChange,
  selectedName,
  placeholder,
  excludeUserId,
}: {
  id?: string;
  value: string | null;
  onChange: (userId: string | null, name: string | null) => void;
  selectedName?: string | null;
  placeholder?: string;
  excludeUserId?: string | null;
}) {
  const { t } = useI18n();
  const { churchId } = useChurch();
  const [search, setSearch] = useState('');
  const query = useQuery(membersQuery(churchId, search));
  const items = (query.data?.items ?? []).filter((item) => item.userId !== excludeUserId);
  const options = [
    ...(value && selectedName && !items.some((item) => item.userId === value)
      ? [{ userId: value, name: selectedName }]
      : []),
    ...items,
  ];
  return (
    <Combobox
      id={id}
      value={value}
      clearable
      placeholder={placeholder ?? t('finance.chooseMember')}
      searchPlaceholder={t('finance.searchMembers')}
      loading={query.isFetching}
      onSearchChange={setSearch}
      options={options.map((item) => ({
        value: item.userId,
        label: item.name,
        leading: <EntityAvatar name={item.name} size="xs" />,
      }))}
      onChange={(next) =>
        onChange(next, options.find((item) => item.userId === next)?.name ?? null)
      }
    />
  );
}

/**
 * A confirmation that asks for a reason (voiding, returning, reopening). The reason is kept in
 * the audit log, so it is required unless `optional` is set.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  label,
  optional = false,
  destructive = true,
  loading = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  label?: string;
  optional?: boolean;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const id = useId();
  const valid = optional || reason.trim().length >= 3;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason('');
        onOpenChange(next);
      }}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      variant={destructive ? 'destructive' : 'default'}
      loading={loading}
      onConfirm={() => {
        if (!valid) return;
        return onConfirm(reason.trim());
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>
          {label ?? t('finance.reason')}
          {!optional ? (
            <span className="text-destructive" aria-hidden>
              *
            </span>
          ) : null}
        </Label>
        <Textarea
          id={id}
          value={reason}
          autoFocus
          className="min-h-20"
          aria-invalid={!valid && reason.length > 0}
          onChange={(event) => setReason(event.target.value)}
        />
        {!optional ? (
          <p className="text-xs text-muted-foreground">{t('finance.reasonHint')}</p>
        ) : null}
      </div>
    </ConfirmDialog>
  );
}
