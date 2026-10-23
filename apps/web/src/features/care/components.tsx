import { PRIORITY_TONES, STAGE_TONES, STATUS_TONES, personName } from './helpers';
import {
  CARE_PRIORITY_LABELS,
  CARE_STATUS_LABELS,
  FOLLOW_UP_STAGE_LABELS,
  canViewDiakonia,
  fullName,
  isCareTeam,
  localize,
  type CarePriority,
  type CareStatus,
  type CareTeamMember,
  type FollowUpStage,
  type HouseholdRef,
  type PersonSummary,
  type PrayerVisibility,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { AlarmClock, CalendarClock, House, Lock, ShieldCheck, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { NavLink } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { EntityAvatar } from '@/components/ui/avatar';
import { Combobox } from '@/components/ui/combobox';
import { StatusBadge } from '@/components/ui/status-badge';
import { Switch } from '@/components/ui/switch';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { careTeamQuery, householdLookupQuery, peopleLookupQuery } from './api';

// ---- Tones and icons -----------------------------------------------------------------------------

// ---- Badges --------------------------------------------------------------------------------------

export function CaseStatusBadge({ status, size }: { status: CareStatus; size?: 'sm' | 'md' }) {
  const { locale } = useI18n();
  return (
    <StatusBadge tone={STATUS_TONES[status]} dot size={size}>
      {localize(CARE_STATUS_LABELS[status], locale)}
    </StatusBadge>
  );
}

export function PriorityBadge({
  priority,
  size,
  quiet = false,
}: {
  priority: CarePriority;
  size?: 'sm' | 'md';
  /** Hides normal and low priority, which need no attention. */
  quiet?: boolean;
}) {
  const { locale } = useI18n();
  if (quiet && (priority === 'normal' || priority === 'low')) return null;
  return (
    <StatusBadge
      tone={PRIORITY_TONES[priority]}
      size={size}
      icon={priority === 'urgent' ? AlarmClock : undefined}
    >
      {localize(CARE_PRIORITY_LABELS[priority], locale)}
    </StatusBadge>
  );
}

export function ConfidentialBadge({ size }: { size?: 'sm' | 'md' }) {
  const { t } = useI18n();
  return (
    <StatusBadge tone="danger" icon={Lock} size={size} className="shrink-0">
      {t('care.confidential')}
    </StatusBadge>
  );
}

export function StageBadge({ stage, size }: { stage: FollowUpStage; size?: 'sm' | 'md' }) {
  const { locale } = useI18n();
  return (
    <StatusBadge tone={STAGE_TONES[stage]} dot size={size}>
      {localize(FOLLOW_UP_STAGE_LABELS[stage], locale)}
    </StatusBadge>
  );
}

const VISIBILITY_ICONS: Record<PrayerVisibility, React.ComponentType<{ className?: string }>> = {
  church: Users,
  care_team: ShieldCheck,
  pastors: Lock,
};

export function VisibilityBadge({ visibility }: { visibility: PrayerVisibility }) {
  const { t } = useI18n();
  const labels: Record<PrayerVisibility, MessageKey> = {
    church: 'care.visibilityChurchShort',
    care_team: 'care.visibilityCareTeamShort',
    pastors: 'care.visibilityPastorsShort',
  };
  return (
    <StatusBadge
      tone={visibility === 'church' ? 'neutral' : visibility === 'care_team' ? 'info' : 'violet'}
      icon={VISIBILITY_ICONS[visibility]}
      size="sm"
    >
      {t(labels[visibility])}
    </StatusBadge>
  );
}

/** A due date: red when overdue, amber today, quiet otherwise. */
export function DueLabel({
  date,
  today,
  done = false,
  className,
}: {
  date: string | null;
  today: string;
  done?: boolean;
  className?: string;
}) {
  const { t, formatDate } = useI18n();
  if (!date) return null;
  const overdue = !done && date < today;
  const isToday = !done && date === today;
  return (
    <span
      data-tone={overdue ? 'danger' : isToday ? 'warning' : undefined}
      className={cn(
        // Wraps instead of being cut off in narrow cards (an overdue date is the point).
        'inline-flex min-w-0 items-center gap-1 text-xs font-medium whitespace-normal tabular',
        overdue || isToday ? 'text-tone-ink' : 'text-muted-foreground',
        className,
      )}
    >
      {overdue ? (
        <AlarmClock className="size-3.5 shrink-0" />
      ) : (
        <CalendarClock className="size-3.5 shrink-0" />
      )}
      {overdue
        ? t('care.overdueSince', { date: formatDate(date, 'dateShort') })
        : isToday
          ? t('care.dueToday')
          : t('care.dueOn', { date: formatDate(date, 'dateShort') })}
    </span>
  );
}

// ---- Module navigation ---------------------------------------------------------------------------

type CareSection = {
  to: string;
  labelKey: MessageKey;
  end?: boolean;
  visible: (access: ReturnType<typeof useChurch>['access']) => boolean;
};

const SECTIONS: CareSection[] = [
  { to: 'care', labelKey: 'care.navOverview', end: true, visible: () => true },
  { to: 'care/cases', labelKey: 'care.navCases', visible: isCareTeam },
  { to: 'care/visits', labelKey: 'care.navVisits', visible: isCareTeam },
  { to: 'care/prayer', labelKey: 'care.navPrayer', visible: () => true },
  { to: 'care/follow-ups', labelKey: 'care.navFollowUps', visible: isCareTeam },
  { to: 'care/tasks', labelKey: 'care.navTasks', visible: () => true },
  { to: 'care/diakonia', labelKey: 'care.navDiakonia', visible: canViewDiakonia },
];

/** The module's sections as pills, limited to what the caller may open. */
export function CareNav({ className }: { className?: string }) {
  const { t } = useI18n();
  const { access, base } = useChurch();
  const items = SECTIONS.filter((section) => section.visible(access));
  if (items.length <= 2) return null;
  return (
    <nav
      aria-label={t('care.nav')}
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
    </nav>
  );
}

// ---- Pickers -------------------------------------------------------------------------------------

/** Picks one person from the directory, searching on the server. */
export function PersonCombobox({
  id,
  value,
  onChange,
  selected,
  placeholder,
  invalid,
  describedBy,
}: {
  id?: string;
  value: string | null;
  onChange: (value: string | null, person: PersonSummary | null) => void;
  /** The current person, so their name shows before any search. */
  selected?: PersonSummary | null;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const { t } = useI18n();
  const { churchId } = useChurch();
  const [search, setSearch] = useState('');
  const [known, setKnown] = useState<Map<string, PersonSummary>>(
    () => new Map(selected ? [[selected.id, selected]] : []),
  );
  const query = useQuery(peopleLookupQuery(churchId, search));
  const people = useMemo(() => {
    const map = new Map(known);
    for (const person of query.data?.items ?? []) map.set(person.id, person);
    return map;
  }, [known, query.data]);
  const visible = query.data?.items ?? [];
  const current = value ? people.get(value) : undefined;
  const options = [
    ...(current && !visible.some((person) => person.id === current.id) ? [current] : []),
    ...visible,
  ];
  return (
    <Combobox
      id={id}
      value={value}
      clearable
      aria-invalid={invalid}
      aria-describedby={describedBy}
      placeholder={placeholder ?? t('care.choosePerson')}
      searchPlaceholder={t('care.searchPeople')}
      emptyText={t('care.noPeopleFound')}
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

/** Picks several people (the visitors of a visit). */
export function PeopleCombobox({
  id,
  value,
  onChange,
  selected = [],
}: {
  id?: string;
  value: string[];
  onChange: (value: string[]) => void;
  selected?: PersonSummary[];
}) {
  const { t } = useI18n();
  const { churchId } = useChurch();
  const [search, setSearch] = useState('');
  const [known, setKnown] = useState<Map<string, PersonSummary>>(
    () => new Map(selected.map((person) => [person.id, person])),
  );
  const query = useQuery(peopleLookupQuery(churchId, search));
  const people = useMemo(() => {
    const map = new Map(known);
    for (const person of query.data?.items ?? []) map.set(person.id, person);
    return map;
  }, [known, query.data]);
  const visible = query.data?.items ?? [];
  const chosen = value.flatMap((personId) => {
    const person = people.get(personId);
    return person && !visible.some((item) => item.id === personId) ? [person] : [];
  });
  return (
    <Combobox
      id={id}
      multiple
      value={value}
      clearable
      placeholder={t('care.choosePeople')}
      searchPlaceholder={t('care.searchPeople')}
      emptyText={t('care.noPeopleFound')}
      loading={query.isFetching}
      onSearchChange={setSearch}
      options={[...chosen, ...visible].map((person) => ({
        value: person.id,
        label: fullName(person),
        leading: <EntityAvatar name={fullName(person)} src={person.photoUrl} size="xs" />,
      }))}
      onChange={(next) => {
        setKnown((map) => {
          const copy = new Map(map);
          for (const personId of next) {
            const person = people.get(personId);
            if (person) copy.set(personId, person);
          }
          return copy;
        });
        onChange(next);
      }}
    />
  );
}

const memberOption = (member: CareTeamMember, careTeamLabel: string) => ({
  value: member.userId,
  label: member.name,
  description: member.isCareTeam ? careTeamLabel : undefined,
  leading: <EntityAvatar name={member.name} src={member.avatarUrl} size="xs" />,
});

/**
 * Picks church members (caregivers, assignees). Care managers can choose every member; others
 * the care team.
 */
export function MemberCombobox(
  props: {
    id?: string;
    invalid?: boolean;
    placeholder?: string;
    /** Every active member instead of the care team (needs care.manage). */
    everyone?: boolean;
  } & (
    | { multiple: true; value: string[]; onChange: (value: string[]) => void }
    | { multiple?: false; value: string | null; onChange: (value: string | null) => void }
  ),
) {
  const { t } = useI18n();
  const { churchId } = useChurch();
  const query = useQuery(careTeamQuery(churchId, props.everyone ? 'all' : 'team'));
  const members = [...(query.data?.items ?? [])].sort(
    (a, b) => Number(b.isCareTeam) - Number(a.isCareTeam) || a.name.localeCompare(b.name),
  );
  const options = members.map((member) => memberOption(member, t('care.careTeam')));
  const common = {
    id: props.id,
    options,
    clearable: true,
    loading: query.isFetching,
    'aria-invalid': props.invalid,
    placeholder: props.placeholder ?? t('care.chooseMember'),
    searchPlaceholder: t('care.searchMembers'),
    emptyText: t('care.noMembersFound'),
  };
  return props.multiple ? (
    <Combobox {...common} multiple value={props.value} onChange={props.onChange} />
  ) : (
    <Combobox {...common} value={props.value} onChange={props.onChange} />
  );
}

/** Picks a household, searching on the server. */
export function HouseholdCombobox({
  id,
  value,
  onChange,
  selected,
}: {
  id?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  selected?: HouseholdRef | null;
}) {
  const { t } = useI18n();
  const { churchId } = useChurch();
  const [search, setSearch] = useState('');
  const query = useQuery(householdLookupQuery(churchId, search));
  const visible = query.data?.items ?? [];
  const options = [
    ...(selected && !visible.some((item) => item.id === selected.id) ? [selected] : []),
    ...visible,
  ];
  return (
    <Combobox
      id={id}
      value={value}
      clearable
      placeholder={t('care.chooseHousehold')}
      searchPlaceholder={t('care.searchHouseholds')}
      emptyText={t('care.noHouseholdsFound')}
      loading={query.isFetching}
      onSearchChange={setSearch}
      options={options.map((household) => ({
        value: household.id,
        label: household.name,
        leading: <House className="size-4 text-muted-foreground" />,
      }))}
      onChange={onChange}
    />
  );
}

/** A small "who" line: avatar and name of a person or household. */
export function SubjectLine({
  person,
  household,
  fallback,
  className,
}: {
  person: PersonSummary | null;
  household?: HouseholdRef | null;
  fallback?: string;
  className?: string;
}) {
  const name = personName(person) ?? household?.name ?? fallback ?? '—';
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      {person ? (
        <EntityAvatar name={name} src={person.photoUrl} size="xs" />
      ) : household ? (
        <House className="size-4 shrink-0 text-muted-foreground" />
      ) : null}
      <span className="truncate">{name}</span>
    </span>
  );
}

/** A labelled switch on a full-width, touch-friendly row. */
export function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-xl border border-border/70 px-3.5 py-3 transition-colors hover:bg-muted/40',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-pretty text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </label>
  );
}
