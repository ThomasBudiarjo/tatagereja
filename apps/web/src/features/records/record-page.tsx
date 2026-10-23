import {
  PRIVATE_RECORD_DETAILS,
  RECORD_TYPE_DETAILS,
  RECORDS_LIMITS,
  canViewRegistry,
  recordPrimaryRole,
  recordTypeText,
  voidRegistryRecordBodySchema,
  type RecordHistoryEntry,
  type RecordSideEffect,
  type RegistryRecord,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Ban,
  CalendarDays,
  ExternalLink,
  FilePenLine,
  FileText,
  History,
  MapPin,
  MoreHorizontal,
  PenLine,
  Printer,
  Sparkles,
  Undo2,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/misc';
import { SkeletonText } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Timeline, TimelineItem } from '@/components/ui/timeline';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { recordQuery, useVoidRecord } from './api';
import {
  DATE_DETAILS,
  DETAIL_LABEL_KEYS,
  FIELD_LABEL_KEYS,
  RECORD_TYPE_META,
  otherChurchLabelKey,
  recordTitle,
  roleLabelKey,
} from './records-lib';
import { RecordNotFound, RecordStatusBadge, RecordTypeBadge, SideEffectList } from './records-ui';

export function RecordPage() {
  const { recordId = '' } = useParams();
  const { churchId, base, access } = useChurch();
  const { t } = useI18n();
  const query = useQuery(recordQuery(churchId, recordId));
  const [voiding, setVoiding] = useState(false);
  const viewer = canViewRegistry(access);
  const crumbs = viewer
    ? [{ label: t('records.nav'), to: `${base}/records` }]
    : [{ label: t('records.myTitle'), to: `${base}/records/mine` }];

  if (query.isPending) {
    return (
      <Page>
        <SkeletonText lines={14} />
      </Page>
    );
  }
  if (query.isError) {
    const gone = isApiClientError(query.error) && query.error.status === 404;
    return (
      <Page>
        <PageHeader title={t('records.recordTitle')} breadcrumbs={crumbs} />
        {gone ? (
          <RecordNotFound />
        ) : (
          <ErrorState
            error={query.error}
            message={getErrorMessage(query.error)}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        )}
      </Page>
    );
  }

  const { record, canManage, history, revertibleEffects } = query.data;
  const meta = RECORD_TYPE_META[record.type];
  const title = recordTitle(record);
  const active = record.status === 'active';

  return (
    <Page>
      <PageHeader
        title={title}
        eyebrow={`${t('records.numberLabel')} ${record.number}`}
        icon={meta.icon}
        tone={meta.tone}
        breadcrumbs={[
          ...crumbs,
          ...(viewer
            ? [
                {
                  label: t('records.registerTitle'),
                  to: `${base}/records/register?type=${record.type}`,
                },
              ]
            : []),
          { label: record.number },
        ]}
        actions={
          <>
            <Button asChild size="sm" variant={canManage && active ? 'outline' : 'default'}>
              <Link to={`${base}/records/${record.id}/certificate`}>
                <Printer />
                <span className="hidden sm:inline">{t('records.certificate')}</span>
              </Link>
            </Button>
            {canManage && active ? (
              <>
                <Button asChild size="sm">
                  <Link to={`${base}/records/${record.id}/correct`}>
                    <FilePenLine />
                    <span className="hidden sm:inline">{t('records.correct')}</span>
                  </Link>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-9 text-muted-foreground"
                      aria-label={t('common.moreActions')}
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => setVoiding(true)}
                      className="text-destructive data-[highlighted]:text-destructive [&_svg]:text-destructive"
                    >
                      <Ban />
                      {t('records.void')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}
          </>
        }
      />

      {!active ? (
        <Alert variant="error" title={t('records.voidedBanner')}>
          {record.voidReason
            ? t('records.voidedReason', { reason: record.voidReason })
            : t('records.voidedNoReason')}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <RecordTypeBadge record={record} size="md" />
        <RecordStatusBadge status={record.status} size="md" />
      </div>

      <RecordFacts record={record} />
      <RecordPeople record={record} linkPeople={viewer} />
      <RecordDetails record={record} />

      {history.length > 0 ? <RecordHistory history={history} /> : null}

      {canManage && active ? (
        <VoidDialog
          record={record}
          effects={revertibleEffects}
          open={voiding}
          onOpenChange={setVoiding}
        />
      ) : null}
    </Page>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium break-words">{children}</dd>
      </div>
    </div>
  );
}

function RecordFacts({ record }: { record: RegistryRecord }) {
  const { t, formatDate } = useI18n();
  return (
    <Card>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Fact
            icon={CalendarDays}
            label={t(record.type === 'death' ? 'records.fieldDeathDate' : 'records.fieldDate')}
          >
            {formatDate(record.date, 'dateLong')}
          </Fact>
          <Fact
            icon={MapPin}
            label={t(record.type === 'death' ? 'records.fieldDeathPlace' : 'records.fieldPlace')}
          >
            {record.place ?? '—'}
          </Fact>
          {record.type !== 'death' &&
          record.type !== 'transfer_in' &&
          record.type !== 'transfer_out' ? (
            <Fact icon={UserRound} label={t('records.fieldOfficiant')}>
              {record.officiantName ?? '—'}
            </Fact>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}

function RecordPeople({ record, linkPeople }: { record: RegistryRecord; linkPeople: boolean }) {
  const { base } = useChurch();
  const { t } = useI18n();
  const primary = recordPrimaryRole(record.type);
  return (
    <Section title={t('records.sectionPeople')}>
      <Card>
        <ul className="divide-y divide-border/70">
          {record.people.map((person) => {
            const isPrimary = person.role === primary;
            const spouseIndex = record.people.filter((p) => p.role === 'spouse').indexOf(person);
            const label =
              record.type === 'marriage' && isPrimary
                ? t(spouseIndex === 0 ? 'records.roleGroom' : 'records.roleBride')
                : t(roleLabelKey(record.type, person.role));
            const content = (
              <>
                <EntityAvatar name={person.name} size={isPrimary ? 'md' : 'sm'} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{person.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {label}
                    {!person.personId ? ` · ${t('records.notInDirectory')}` : ''}
                  </span>
                </span>
              </>
            );
            return (
              <li key={person.id}>
                {person.personId && linkPeople ? (
                  <Link
                    to={`${base}/people/${person.personId}`}
                    className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex min-h-14 items-center gap-3 px-4 py-2.5">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </Section>
  );
}

function RecordDetails({ record }: { record: RegistryRecord }) {
  const { t, formatDate } = useI18n();
  const rows = RECORD_TYPE_DETAILS[record.type].flatMap((key) => {
    const value = record.details[key];
    if (!value) return [];
    return [
      {
        key,
        label:
          key === 'otherChurchName'
            ? t(otherChurchLabelKey(record.type))
            : t(DETAIL_LABEL_KEYS[key]),
        value: DATE_DETAILS.includes(key) ? formatDate(value, 'dateLong') : value,
        private: PRIVATE_RECORD_DETAILS.includes(key),
      },
    ];
  });
  if (rows.length === 0 && !record.documentUrl && !record.notes) return null;
  return (
    <Section title={t('records.sectionDetails')}>
      <Card>
        <CardContent className="flex flex-col gap-4">
          {rows.length > 0 ? (
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {rows.map((row) => (
                <div key={row.key} className="min-w-0">
                  <dt className="text-xs font-medium text-muted-foreground">
                    {row.label}
                    {row.private ? ` · ${t('records.notPrinted')}` : ''}
                  </dt>
                  <dd className="mt-0.5 text-sm break-words">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {record.documentUrl ? (
            <a
              href={record.documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 w-fit items-center gap-2 rounded-lg border border-border/70 px-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              <FileText className="size-4 text-muted-foreground" />
              {t('records.openDocument')}
              <ExternalLink className="size-3.5 text-muted-foreground" />
            </a>
          ) : null}
          {record.notes ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t('records.fieldNotes')}</p>
              <p className="mt-0.5 text-sm whitespace-pre-line">{record.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </Section>
  );
}

const HISTORY_META: Record<
  RecordHistoryEntry['action'],
  {
    icon: React.ComponentType<{ className?: string }>;
    tone: 'success' | 'info' | 'danger';
    key: MessageKey;
  }
> = {
  create: { icon: Sparkles, tone: 'success', key: 'records.historyCreate' },
  correct: { icon: PenLine, tone: 'info', key: 'records.historyCorrect' },
  void: { icon: Ban, tone: 'danger', key: 'records.historyVoid' },
};

function RecordHistory({ history }: { history: RecordHistoryEntry[] }) {
  const { t, formatDateTime } = useI18n();
  const fieldLabel = (field: string) => {
    if (field.startsWith('details.')) {
      const key = field.slice('details.'.length) as keyof typeof DETAIL_LABEL_KEYS;
      return DETAIL_LABEL_KEYS[key] ? t(DETAIL_LABEL_KEYS[key]) : field;
    }
    return FIELD_LABEL_KEYS[field] ? t(FIELD_LABEL_KEYS[field]) : field;
  };
  return (
    <Section title={t('records.historyTitle')} icon={History}>
      <Card>
        <CardContent>
          <Timeline>
            {[...history].reverse().map((entry, index) => {
              const meta = HISTORY_META[entry.action];
              return (
                <TimelineItem
                  key={entry.id}
                  icon={meta.icon}
                  tone={meta.tone}
                  title={t(meta.key, { name: entry.actorName ?? t('records.someone') })}
                  time={formatDateTime(entry.createdAt)}
                  last={index === history.length - 1}
                >
                  {entry.note ? <p className="text-sm text-pretty">“{entry.note}”</p> : null}
                  {entry.fields.length > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('records.historyFields', {
                        fields: entry.fields.map(fieldLabel).join(', '),
                      })}
                    </p>
                  ) : null}
                  {entry.effects.length > 0 ? (
                    <SideEffectList effects={entry.effects} className="mt-2" />
                  ) : null}
                </TimelineItem>
              );
            })}
          </Timeline>
        </CardContent>
      </Card>
    </Section>
  );
}

/**
 * Voiding keeps the number in the register; people type the number to confirm. The profile
 * changes the record made can be undone at the same time.
 */
function VoidDialog({
  record,
  effects,
  open,
  onOpenChange,
}: {
  record: RegistryRecord;
  effects: RecordSideEffect[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId } = useChurch();
  const { t, locale } = useI18n();
  const [reason, setReason] = useState('');
  const [revert, setRevert] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const action = useMutationToast(useVoidRecord(churchId, record.id), {
    success: t('records.voidedToast', { number: record.number }),
  });
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setReason('');
          setRevert(true);
          setError(null);
        }
        onOpenChange(next);
      }}
      title={t('records.voidTitle', { number: record.number })}
      description={t('records.voidBody', { type: recordTypeText(record, locale).toLowerCase() })}
      confirmLabel={t('records.void')}
      confirmText={record.number}
      loading={action.isPending}
      onConfirm={async () => {
        const parsed = voidRegistryRecordBodySchema.safeParse({
          reason,
          revertEffects: effects.length > 0 && revert,
        });
        if (!parsed.success) {
          setError(t('records.voidReasonRequired'));
          return;
        }
        const result = await action.run(parsed.data);
        if (result) onOpenChange(false);
      }}
    >
      <Field
        label={t('records.voidReason')}
        htmlFor="void-reason"
        error={error ?? undefined}
        required
      >
        <Textarea
          id="void-reason"
          rows={2}
          maxLength={RECORDS_LIMITS.correctionNoteMax}
          value={reason}
          aria-invalid={!!error}
          onChange={(event) => {
            setReason(event.target.value);
            setError(null);
          }}
        />
      </Field>
      {effects.length > 0 ? (
        <div className="mt-4 flex flex-col gap-2.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Undo2 className="size-4 text-muted-foreground" />
            {t('records.revertTitle')}
          </p>
          <SideEffectList effects={effects} />
          <div className="flex items-start gap-2.5">
            <Checkbox
              id="void-revert-effects"
              checked={revert}
              onCheckedChange={(checked) => setRevert(checked === true)}
              className="mt-0.5"
            />
            <Label htmlFor="void-revert-effects" className="leading-snug font-normal">
              {t('records.revertEffects')}
            </Label>
          </div>
        </div>
      ) : null}
    </ConfirmDialog>
  );
}
