import {
  GROUP_TYPE_TEXT,
  PERSON_STATUS_TEXT,
  localize,
  type AreaSummary,
  type GroupType,
  type PersonMembershipStatus,
} from '@tatagereja/shared';
import { Cake, Check, Heart, Mail, MessageCircle, Phone } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { GROUP_TYPE_STYLE, STATUS_TONE, SWATCHES, upcomingInDays, whatsappLink } from './labels';

/*
 * Small building blocks shared by the directory, person, household, area and group screens.
 */

export function PersonStatusBadge({
  status,
  size = 'md',
  className,
}: {
  status: PersonMembershipStatus;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const { locale } = useI18n();
  return (
    <StatusBadge tone={STATUS_TONE[status]} dot size={size} className={className}>
      {localize(PERSON_STATUS_TEXT[status], locale)}
    </StatusBadge>
  );
}

/** A tag in its church-chosen colour (or a neutral chip). */
export function TagChip({
  tag,
  className,
}: {
  tag: { name: string; color: string | null };
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 max-w-40 items-center gap-1.5 rounded-full border border-border/80 bg-card px-2.5 text-xs font-medium text-foreground',
        className,
      )}
    >
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full bg-muted-foreground/40"
        style={tag.color ? { backgroundColor: tag.color } : undefined}
      />
      <span className="truncate">{tag.name}</span>
    </span>
  );
}

export function AreaChip({ area, className }: { area: AreaSummary; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 max-w-44 items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs font-medium text-muted-foreground',
        className,
      )}
    >
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-[3px] bg-emerald-600/70"
        style={area.color ? { backgroundColor: area.color } : undefined}
      />
      <span className="truncate">{area.code ? `${area.code} · ${area.name}` : area.name}</span>
    </span>
  );
}

/** "Birthday in 3 days" and "Anniversary today" chips for the celebration window. */
export function CelebrationBadges({
  birthDate,
  weddingDate,
  today,
  compact = false,
}: {
  birthDate: string | null;
  weddingDate: string | null;
  today: string;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const birthday = upcomingInDays(birthDate, today);
  const anniversary = upcomingInDays(weddingDate, today);
  if (birthday === null && anniversary === null) return null;
  const when = (days: number) =>
    days === 0 ? t('people.today') : t('people.inDays', { count: days });
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {birthday !== null ? (
        <StatusBadge
          tone="rose"
          size="sm"
          icon={Cake}
          title={t('people.birthdayIn', { when: when(birthday) })}
          aria-label={t('people.birthdayIn', { when: when(birthday) })}
        >
          {compact ? null : when(birthday)}
        </StatusBadge>
      ) : null}
      {anniversary !== null ? (
        <StatusBadge
          tone="violet"
          size="sm"
          icon={Heart}
          title={t('people.anniversaryIn', { when: when(anniversary) })}
          aria-label={t('people.anniversaryIn', { when: when(anniversary) })}
        >
          {compact ? null : when(anniversary)}
        </StatusBadge>
      ) : null}
    </span>
  );
}

/** Call, WhatsApp and e-mail shortcuts; only the fields the caller may see are passed in. */
export function ContactButtons({
  phone,
  email,
  className,
}: {
  phone: string | null;
  email: string | null;
  className?: string;
}) {
  const { t } = useI18n();
  const wa = phone ? whatsappLink(phone) : null;
  const button =
    'inline-flex size-11 items-center justify-center rounded-full border border-border/80 bg-card text-foreground shadow-xs transition-[background-color,transform] duration-150 hover:bg-muted active:scale-95 focus-visible:ring-[3px] focus-visible:ring-ring/40 outline-none [&_svg]:size-[18px]';
  if (!phone && !email) return null;
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {phone ? (
        <a href={`tel:${phone}`} className={button} aria-label={t('people.call', { phone })}>
          <Phone />
        </a>
      ) : null}
      {wa ? (
        <a
          href={wa}
          target="_blank"
          rel="noreferrer"
          className={cn(button, 'text-success')}
          aria-label={t('people.whatsapp')}
        >
          <MessageCircle />
        </a>
      ) : null}
      {email ? (
        <a href={`mailto:${email}`} className={button} aria-label={t('people.email', { email })}>
          <Mail />
        </a>
      ) : null}
    </div>
  );
}

/** The coloured tile of a group: its cover colour, or its type colour, with the type icon. */
export function GroupCover({
  type,
  color,
  size = 'md',
  className,
}: {
  type: GroupType;
  color: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const { locale } = useI18n();
  const style = GROUP_TYPE_STYLE[type];
  const Icon = style.icon;
  return (
    <span
      data-tone={color ? undefined : style.tone}
      aria-label={localize(GROUP_TYPE_TEXT[type], locale)}
      role="img"
      className={cn(
        'flex shrink-0 items-center justify-center',
        color ? 'text-white' : 'bg-tone-soft text-tone-ink',
        size === 'sm' && 'size-9 rounded-lg [&>svg]:size-4',
        size === 'md' && 'size-11 rounded-xl [&>svg]:size-5',
        size === 'lg' && 'size-14 rounded-2xl [&>svg]:size-7',
        className,
      )}
      style={color ? { backgroundColor: color } : undefined}
    >
      <Icon aria-hidden />
    </span>
  );
}

/** A colour choice for areas and groups, with "none" first. */
export function ColorSwatches({
  value,
  onChange,
  label,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  label: string;
}) {
  const { t } = useI18n();
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      <button
        type="button"
        role="radio"
        aria-checked={!value}
        onClick={() => onChange(null)}
        className={cn(
          'flex size-9 items-center justify-center rounded-full border border-dashed border-input text-xs text-muted-foreground transition-transform outline-none hover:scale-105 focus-visible:ring-[3px] focus-visible:ring-ring/40',
          !value && 'ring-2 ring-ring ring-offset-2 ring-offset-card',
        )}
        aria-label={t('common.none')}
      >
        —
      </button>
      {SWATCHES.map((swatch) => (
        <button
          key={swatch}
          type="button"
          role="radio"
          aria-checked={value === swatch}
          aria-label={swatch}
          onClick={() => onChange(swatch)}
          className={cn(
            'flex size-9 items-center justify-center rounded-full text-white transition-transform outline-none hover:scale-105 focus-visible:ring-[3px] focus-visible:ring-ring/40',
            value === swatch && 'ring-2 ring-ring ring-offset-2 ring-offset-card',
          )}
          style={{ backgroundColor: swatch }}
        >
          {value === swatch ? <Check className="size-4" aria-hidden /> : null}
        </button>
      ))}
    </div>
  );
}
