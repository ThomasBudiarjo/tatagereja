import type { BulletinRenderedSection } from '@tatagereja/shared';
import { Clock, MapPin, UserRound } from 'lucide-react';
import { Markdown } from '@/features/comms/markdown';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { SECTION_ICONS, SECTION_TONES, hasContent } from './bulletin-lib';

/**
 * One section of the Warta Jemaat, laid out for screen and paper: a heading with its icon, then
 * the content in the style of a printed church bulletin.
 */
export function BulletinSectionView({
  section,
  showEmpty = false,
}: {
  section: BulletinRenderedSection;
  showEmpty?: boolean;
}) {
  const { t, formatDate, formatTime, formatDateTime, formatCurrency } = useI18n();
  const Icon = SECTION_ICONS[section.kind];
  const empty = !hasContent(section);
  if (empty && !showEmpty) return null;

  return (
    <section
      className="break-inside-avoid-page flex flex-col gap-3 print:break-inside-avoid"
      aria-label={section.title}
    >
      <h2 className="flex items-center gap-2.5 border-b border-border/80 pb-2 text-base font-bold tracking-tight uppercase sm:text-[1.05rem]">
        <span
          data-tone={SECTION_TONES[section.kind]}
          className="flex size-7 items-center justify-center rounded-lg bg-tone-soft text-tone-ink print:hidden"
          aria-hidden
        >
          <Icon className="size-4" />
        </span>
        {section.title}
      </h2>
      {empty ? (
        <p className="text-sm text-muted-foreground italic">{t('comms.bulletinNothingThisWeek')}</p>
      ) : section.kind === 'text' ? (
        <Markdown source={section.body ?? ''} />
      ) : section.kind === 'announcements' ? (
        <ol className="flex flex-col gap-4">
          {section.items.map((item, index) => (
            <li key={item.id} className="flex gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold tabular">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{item.title}</p>
                {item.body ? (
                  <Markdown source={item.body} className="mt-1 text-sm text-foreground/85" />
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : section.kind === 'services' || section.kind === 'events' ? (
        <ul className="flex flex-col divide-y divide-border/60">
          {section.items.map((item) => (
            <li key={item.id} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="w-14 shrink-0 text-center">
                <span className="block text-[11px] font-semibold text-muted-foreground uppercase">
                  {item.startsAt ? formatDate(item.startsAt, 'weekdayShort') : ''}
                </span>
                <span className="block text-lg leading-tight font-bold tabular">
                  {item.startsAt ? formatDate(item.startsAt, { options: { day: 'numeric' } }) : ''}
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{item.title}</p>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                  {item.startsAt ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3.5" aria-hidden />
                      {formatTime(item.startsAt)}
                    </span>
                  ) : null}
                  {section.kind === 'services' && item.subtitle ? (
                    <span className="inline-flex items-center gap-1">
                      <UserRound className="size-3.5" aria-hidden />
                      {item.subtitle}
                    </span>
                  ) : null}
                  {(section.kind === 'services' ? item.body : item.subtitle) ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" aria-hidden />
                      {section.kind === 'services' ? item.body : item.subtitle}
                    </span>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : section.kind === 'rosters' ? (
        <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
          {section.items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-border/70 bg-sunken/40 p-3 print:border-black/20 print:bg-transparent"
            >
              <p className="font-semibold">{item.title}</p>
              {item.startsAt ? (
                <p className="mb-1.5 text-xs text-muted-foreground">
                  {formatDateTime(item.startsAt)}
                </p>
              ) : null}
              {item.body ? <Markdown source={item.body} className="gap-1 text-sm" /> : null}
            </div>
          ))}
        </div>
      ) : section.kind === 'birthdays' || section.kind === 'anniversaries' ? (
        <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 print:grid-cols-2">
          {section.items.map((item) => (
            <li key={item.id} className="flex items-baseline gap-2 text-sm">
              <span className="w-16 shrink-0 font-semibold text-muted-foreground tabular">
                {item.date ? formatDate(item.date, 'dayMonth') : ''}
              </span>
              <span className="min-w-0 flex-1">{item.title}</span>
              {item.years !== null && item.years > 0 ? (
                <span className={cn('shrink-0 text-xs text-muted-foreground tabular')}>
                  {t('comms.bulletinYears', { count: item.years })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : section.finance ? (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-xs text-muted-foreground">
            {t('comms.bulletinFinancePeriod', {
              from: formatDate(section.finance.from, 'dayMonth'),
              to: formatDate(section.finance.to, 'dateShort'),
            })}
          </p>
          <table className="w-full">
            <tbody>
              {section.finance.byCategory.map((row) => (
                <tr key={row.name} className="border-b border-border/50">
                  <td className="py-1.5">{row.name}</td>
                  <td className="py-1.5 text-right tabular">
                    {formatCurrency(row.amount, { currency: section.finance?.currency })}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="pt-2">{t('comms.bulletinIncome')}</td>
                <td className="pt-2 text-right tabular">
                  {formatCurrency(section.finance.income, { currency: section.finance.currency })}
                </td>
              </tr>
              <tr className="text-muted-foreground">
                <td className="pt-1">{t('comms.bulletinExpense')}</td>
                <td className="pt-1 text-right tabular">
                  {formatCurrency(section.finance.expense, { currency: section.finance.currency })}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
