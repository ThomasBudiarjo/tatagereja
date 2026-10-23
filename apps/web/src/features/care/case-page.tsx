import {
  CARE_CATEGORY_LABELS,
  CARE_NOTE_INPUT_KINDS,
  CARE_NOTE_KIND_LABELS,
  CARE_STATUS_LABELS,
  canViewDiakonia,
  careNoteInputSchema,
  has,
  isCareStatus,
  localize,
  type CareCase,
  type CareNote,
  type CareNoteInput,
  type CareNoteKind,
  type CareTask,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  CheckCircle2,
  Footprints,
  HandCoins,
  ListTodo,
  Lock,
  MessageSquareText,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  PhoneCall,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataList } from '@/components/ui/data-list';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Alert, Segmented } from '@/components/ui/misc';
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { ToneIcon } from '@/components/ui/status-badge';
import { TabsContent, TabsList, TabsTrigger, UrlTabs } from '@/components/ui/tabs';
import { Timeline, TimelineItem } from '@/components/ui/timeline';
import type { Tone } from '@/components/ui/tone';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import {
  aidListQuery,
  caseNotesQuery,
  caseQuery,
  caseUpdateFrom,
  tasksQuery,
  useAddNote,
  useDeleteCase,
  useDeleteNote,
  useSaveCase,
  useSetCaregivers,
  useUpdateNote,
  visitsQuery,
} from './api';
import {
  CaseStatusBadge,
  ConfidentialBadge,
  DueLabel,
  MemberCombobox,
  PriorityBadge,
  SubjectLine,
} from './components';
import { CATEGORY_ICONS, CATEGORY_TONES, personName, useToday } from './helpers';
import { TaskList, TaskSheet } from './task-components';

const NOTE_ICONS: Record<CareNoteKind, LucideIcon> = {
  note: NotebookPen,
  call: PhoneCall,
  visit: Footprints,
  meeting: UsersRound,
  status_change: CheckCircle2,
};

const NOTE_TONES: Record<CareNoteKind, Tone> = {
  note: 'neutral',
  call: 'sky',
  visit: 'teal',
  meeting: 'violet',
  status_change: 'success',
};

export function CasePage() {
  const { t } = useI18n();
  const { churchId, base } = useChurch();
  const { caseId = '' } = useParams();
  const query = useQuery(caseQuery(churchId, caseId));
  const crumbs = [
    { label: t('care.nav'), to: `${base}/care` },
    { label: t('care.navCases'), to: `${base}/care/cases` },
  ];

  if (query.isPending) {
    return (
      <Page>
        <PageHeader title={t('care.caseDetail')} breadcrumbs={crumbs} documentTitle={false} />
        <SkeletonText lines={4} />
        <SkeletonList rows={4} />
      </Page>
    );
  }
  if (query.isError) {
    const gone = isApiClientError(query.error) && query.error.status === 404;
    return (
      <Page>
        <PageHeader title={t('care.caseDetail')} breadcrumbs={crumbs} />
        {gone ? (
          <EmptyState
            icon={Lock}
            tone="slate"
            title={t('care.caseGoneTitle')}
            description={t('care.caseGoneDescription')}
            action={
              <Button asChild variant="outline">
                <Link to={`${base}/care/cases`}>{t('care.backToCases')}</Link>
              </Button>
            }
          />
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
  return <CaseDetail careCase={query.data.case} crumbs={crumbs} />;
}

function CaseDetail({
  careCase,
  crumbs,
}: {
  careCase: CareCase;
  crumbs: { label: string; to?: string }[];
}) {
  const { t, locale, formatDate, formatRelative } = useI18n();
  const { churchId, base, access } = useChurch();
  const navigate = useNavigate();
  const today = useToday();
  const [closing, setClosing] = useState(false);
  const [closedReason, setClosedReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const save = useMutationToast(useSaveCase(churchId), { success: t('care.statusUpdated') });
  const remove = useMutationToast(useDeleteCase(churchId), { success: t('care.caseDeleted') });
  const setStatus = async (status: CareCase['status'], reason: string | null = null) =>
    save.run({ id: careCase.id, ...caseUpdateFrom(careCase, { status, closedReason: reason }) });
  const subject = personName(careCase.person) ?? careCase.household?.name ?? null;
  const tabs = ['timeline', 'visits', 'tasks', ...(canViewDiakonia(access) ? ['aid'] : [])];

  return (
    <Page>
      <PageHeader
        icon={CATEGORY_ICONS[careCase.category]}
        tone={CATEGORY_TONES[careCase.category]}
        eyebrow={localize(CARE_CATEGORY_LABELS[careCase.category], locale)}
        title={careCase.title}
        documentTitle={
          careCase.confidentiality === 'confidential' ? t('care.caseDetail') : careCase.title
        }
        breadcrumbs={[...crumbs, { label: careCase.title }]}
        actions={
          careCase.canManage ? (
            <>
              <Button asChild variant="outline" className="max-sm:size-11 max-sm:px-0">
                <Link to={`${base}/care/cases/${careCase.id}/edit`}>
                  <Pencil />
                  <span className="hidden sm:inline">{t('common.edit')}</span>
                  <span className="sr-only sm:hidden">{t('common.edit')}</span>
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon-lg" aria-label={t('common.moreActions')}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {careCase.status === 'open' ? (
                    <DropdownMenuItem onSelect={() => void setStatus('in_progress')}>
                      <Play />
                      {t('care.startCare')}
                    </DropdownMenuItem>
                  ) : null}
                  {careCase.status !== 'closed' ? (
                    <DropdownMenuItem onSelect={() => setClosing(true)}>
                      <CheckCircle2 />
                      {t('care.closeCase')}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => void setStatus('open')}>
                      <RotateCcw />
                      {t('care.reopenCase')}
                    </DropdownMenuItem>
                  )}
                  {careCase.canAdminister ? (
                    <>
                      <DropdownMenuItem onSelect={() => setAssigning(true)}>
                        <Users />
                        {t('care.changeCaregivers')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem destructive onSelect={() => setDeleting(true)}>
                        <Trash2 />
                        {t('care.deleteCase')}
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null
        }
      />

      {careCase.confidentiality === 'confidential' ? (
        <Alert variant="error" title={t('care.confidentialBannerTitle')}>
          {t('care.confidentialBanner')}
        </Alert>
      ) : null}

      <Card className="animate-rise-in">
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <CaseStatusBadge status={careCase.status} />
            <PriorityBadge priority={careCase.priority} />
            {careCase.confidentiality === 'confidential' ? <ConfidentialBadge /> : null}
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-overline text-muted-foreground">{t('care.person')}</dt>
              <dd className="mt-1.5 text-sm font-medium">
                {careCase.person ? (
                  <Link
                    to={`${base}/people/${careCase.person.id}`}
                    className="rounded-sm underline-offset-2 hover:underline"
                  >
                    <SubjectLine person={careCase.person} />
                  </Link>
                ) : (
                  <SubjectLine person={null} household={careCase.household} />
                )}
                {careCase.person && careCase.household ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('care.householdOf', { name: careCase.household.name })}
                  </p>
                ) : null}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-overline text-muted-foreground">{t('care.caregivers')}</dt>
              <dd className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
                {careCase.caregivers.length === 0 ? (
                  <span className="text-muted-foreground">{t('care.noCaregiver')}</span>
                ) : (
                  careCase.caregivers.map((caregiver) => (
                    <span
                      key={caregiver.userId}
                      className="inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pr-2.5 pl-0.5 text-xs font-medium"
                    >
                      <EntityAvatar name={caregiver.name} src={caregiver.avatarUrl} size="xs" />
                      {caregiver.name}
                    </span>
                  ))
                )}
                {careCase.canAdminister ? (
                  <Button variant="ghost" size="xs" onClick={() => setAssigning(true)}>
                    <Pencil />
                    {t('care.change')}
                  </Button>
                ) : null}
              </dd>
            </div>
          </dl>

          {careCase.status !== 'closed' ? (
            <div
              data-tone="rose"
              className="flex items-start gap-3 rounded-xl border border-tone/20 bg-tone-soft/40 p-3.5"
            >
              <ToneIcon icon={CalendarClock} tone="rose" size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-overline text-tone-ink">{t('care.nextStep')}</p>
                {careCase.nextActionDate || careCase.nextActionNote ? (
                  <>
                    <p className="mt-0.5 text-sm font-medium text-pretty">
                      {careCase.nextActionNote ?? t('care.nextStepUnnamed')}
                    </p>
                    <DueLabel date={careCase.nextActionDate} today={today} className="mt-1" />
                  </>
                ) : (
                  <p className="mt-0.5 text-sm text-muted-foreground">{t('care.noNextStep')}</p>
                )}
              </div>
            </div>
          ) : (
            <Alert
              variant="success"
              title={t('care.closedOn', { date: formatDate(careCase.closedAt, 'dateLong') })}
            >
              {careCase.closedReason ?? t('care.closedNoReason')}
            </Alert>
          )}

          {careCase.description ? (
            <div>
              <p className="text-overline text-muted-foreground">{t('care.situation')}</p>
              <p className="mt-1.5 text-sm whitespace-pre-wrap text-pretty">
                {careCase.description}
              </p>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            {careCase.openedBy
              ? t('care.openedBy', {
                  name: careCase.openedBy.name,
                  date: formatDate(careCase.createdAt, 'dateLong'),
                })
              : t('care.openedOn', { date: formatDate(careCase.createdAt, 'dateLong') })}
            {' · '}
            {t('care.updatedAgo', { time: formatRelative(careCase.updatedAt) })}
          </p>

          {careCase.canManage && careCase.status === 'open' ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="soft"
                loading={save.isPending}
                onClick={() => void setStatus('in_progress')}
              >
                <Play />
                {t('care.startCare')}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <UrlTabs defaultValue="timeline" values={tabs}>
        <TabsList variant="underline">
          <TabsTrigger value="timeline">
            <MessageSquareText />
            {t('care.timeline')}
          </TabsTrigger>
          <TabsTrigger value="visits">
            <Footprints />
            {t('care.navVisits')}
          </TabsTrigger>
          <TabsTrigger value="tasks">
            <ListTodo />
            {t('care.navTasks')}
          </TabsTrigger>
          {tabs.includes('aid') ? (
            <TabsTrigger value="aid">
              <HandCoins />
              {t('care.navDiakonia')}
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="timeline">
          <CaseTimeline careCase={careCase} />
        </TabsContent>
        <TabsContent value="visits">
          <CaseVisits careCase={careCase} />
        </TabsContent>
        <TabsContent value="tasks">
          <CaseTasks careCase={careCase} />
        </TabsContent>
        {tabs.includes('aid') ? (
          <TabsContent value="aid">
            <CaseAid careCase={careCase} />
          </TabsContent>
        ) : null}
      </UrlTabs>

      <ConfirmDialog
        open={closing}
        onOpenChange={(open) => {
          setClosing(open);
          if (!open) setClosedReason('');
        }}
        variant="default"
        title={t('care.closeCaseTitle')}
        description={t('care.closeCaseDescription')}
        confirmLabel={t('care.closeCase')}
        loading={save.isPending}
        onConfirm={async () => {
          if (await setStatus('closed', closedReason.trim() || null)) {
            setClosing(false);
            setClosedReason('');
          }
        }}
      >
        <Field label={t('care.closedReason')} htmlFor="close-reason">
          <Input
            id="close-reason"
            autoFocus
            value={closedReason}
            placeholder={t('care.closedReasonPlaceholder')}
            onChange={(event) => setClosedReason(event.target.value)}
          />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('care.deleteCaseTitle')}
        description={t('care.deleteCaseDescription')}
        confirmText={subject ?? careCase.title}
        confirmLabel={t('care.deleteCase')}
        loading={remove.isPending}
        onConfirm={async () => {
          if (await remove.run(careCase.id)) navigate(`${base}/care/cases`, { replace: true });
        }}
      />
      <CaregiversDialog careCase={careCase} open={assigning} onOpenChange={setAssigning} />
    </Page>
  );
}

function CaregiversDialog({
  careCase,
  open,
  onOpenChange,
}: {
  careCase: CareCase;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const { churchId } = useChurch();
  const [value, setValue] = useState<string[]>([]);
  const save = useMutationToast(useSetCaregivers(churchId, careCase.id), {
    success: t('care.caregiversSaved'),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setValue(careCase.caregivers.map((caregiver) => caregiver.userId));
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('care.changeCaregivers')}</DialogTitle>
          <DialogDescription>
            {careCase.confidentiality === 'confidential'
              ? t('care.caregiversConfidentialHint')
              : t('care.caregiversHint')}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="min-h-28">
          <MemberCombobox
            id="case-caregivers-edit"
            multiple
            everyone
            value={value}
            onChange={setValue}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={save.isPending}
            onClick={async () => {
              if (await save.run(value)) onOpenChange(false);
            }}
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type NoteFormValues = z.input<typeof careNoteInputSchema>;

function NoteComposer({ careCase }: { careCase: CareCase }) {
  const { t, locale } = useI18n();
  const { churchId } = useChurch();
  const form = useForm<NoteFormValues, unknown, CareNoteInput>({
    resolver: zodResolver(careNoteInputSchema),
    defaultValues: { kind: 'note', body: '' },
  });
  const add = useMutationToast(useAddNote(churchId, careCase.id), {
    success: t('care.noteAdded'),
    form,
  });
  const onSubmit = form.handleSubmit(async (values) => {
    if (await add.run(values)) form.reset({ kind: values.kind, body: '' });
  });
  return (
    <form
      noValidate
      onSubmit={(event) => void onSubmit(event)}
      className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-3.5 shadow-soft"
    >
      <Controller
        control={form.control}
        name="kind"
        render={({ field }) => (
          <Segmented
            aria-label={t('care.noteKind')}
            className="h-10"
            value={field.value ?? 'note'}
            onChange={field.onChange}
            options={CARE_NOTE_INPUT_KINDS.map((kind) => ({
              value: kind,
              label: localize(CARE_NOTE_KIND_LABELS[kind], locale),
              icon: NOTE_ICONS[kind],
            }))}
          />
        )}
      />
      <Field htmlFor="note-body" error={form.formState.errors.body?.message}>
        <Textarea
          id="note-body"
          rows={3}
          aria-label={t('care.addNote')}
          placeholder={t('care.notePlaceholder')}
          aria-invalid={!!form.formState.errors.body}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void onSubmit();
            }
          }}
          {...form.register('body')}
        />
      </Field>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {careCase.confidentiality === 'confidential' ? <Lock className="size-3.5" /> : null}
          {careCase.confidentiality === 'confidential'
            ? t('care.noteConfidentialHint')
            : t('care.noteCareTeamHint')}
        </p>
        <Button type="submit" size="sm" loading={add.isPending}>
          <Plus />
          {t('care.addNote')}
        </Button>
      </div>
    </form>
  );
}

function CaseTimeline({ careCase }: { careCase: CareCase }) {
  const { t } = useI18n();
  const { churchId } = useChurch();
  const query = useQuery(caseNotesQuery(churchId, careCase.id));
  return (
    <div className="flex flex-col gap-4">
      {careCase.canManage ? <NoteComposer careCase={careCase} /> : null}
      {query.isPending ? (
        <SkeletonList rows={3} />
      ) : query.isError ? (
        <ErrorState
          compact
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          compact
          icon={MessageSquareText}
          tone="rose"
          title={t('care.noNotesTitle')}
          description={careCase.canManage ? t('care.noNotesDescription') : undefined}
        />
      ) : (
        <Timeline className="px-1">
          {query.data.items.map((note, index) => (
            <NoteItem
              key={note.id}
              note={note}
              caseId={careCase.id}
              canAdminister={careCase.canAdminister}
              last={index === query.data.items.length - 1}
            />
          ))}
        </Timeline>
      )}
    </div>
  );
}

function NoteItem({
  note,
  caseId,
  canAdminister,
  last,
}: {
  note: CareNote;
  caseId: string;
  canAdminister: boolean;
  last: boolean;
}) {
  const { t, locale, formatDateTime } = useI18n();
  const { churchId } = useChurch();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const [deleting, setDeleting] = useState(false);
  const update = useMutationToast(useUpdateNote(churchId, caseId), {
    success: t('care.noteUpdated'),
  });
  const remove = useMutationToast(useDeleteNote(churchId, caseId), {
    success: t('care.noteDeleted'),
  });
  const statusNote = note.kind === 'status_change';
  const title = statusNote
    ? t('care.statusChangedTo', {
        status: isCareStatus(note.body)
          ? localize(CARE_STATUS_LABELS[note.body], locale)
          : note.body,
      })
    : localize(CARE_NOTE_KIND_LABELS[note.kind], locale);
  const canDelete = !statusNote && (note.canEdit || canAdminister);
  return (
    <TimelineItem
      icon={NOTE_ICONS[note.kind]}
      tone={NOTE_TONES[note.kind]}
      last={last}
      title={
        <span className="inline-flex flex-wrap items-center gap-x-1.5">
          {title}
          {note.author ? (
            <span className="font-normal text-muted-foreground">· {note.author.name}</span>
          ) : null}
        </span>
      }
      time={
        <>
          {formatDateTime(note.createdAt)}
          {note.updatedAt !== note.createdAt && !statusNote ? ` ${t('care.edited')}` : ''}
        </>
      }
    >
      {statusNote ? null : editing ? (
        <div className="flex flex-col gap-2 pt-1">
          <Textarea
            value={draft}
            rows={4}
            autoFocus
            aria-label={t('care.editNote')}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              loading={update.isPending}
              disabled={!draft.trim()}
              onClick={async () => {
                if (await update.run({ id: note.id, body: draft })) setEditing(false);
              }}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="group/note">
          <p className="whitespace-pre-wrap text-pretty text-foreground/90">{note.body}</p>
          {note.canEdit || canDelete ? (
            <div className="mt-1 flex gap-1">
              {note.canEdit ? (
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => {
                    setDraft(note.body);
                    setEditing(true);
                  }}
                >
                  <Pencil />
                  {t('common.edit')}
                </Button>
              ) : null}
              {canDelete ? (
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleting(true)}
                >
                  <Trash2 />
                  {t('common.delete')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('care.deleteNoteTitle')}
        description={t('care.deleteNoteDescription')}
        confirmLabel={t('common.delete')}
        loading={remove.isPending}
        onConfirm={async () => {
          if (await remove.run(note.id)) setDeleting(false);
        }}
      />
    </TimelineItem>
  );
}

function CaseVisits({ careCase }: { careCase: CareCase }) {
  const { t, formatDate } = useI18n();
  const { churchId, base } = useChurch();
  const query = useQuery(visitsQuery(churchId, { caseId: careCase.id, limit: 50 }));
  const action = careCase.canManage ? (
    <Button asChild size="sm" variant="outline">
      <Link to={`${base}/care/visits/new?caseId=${careCase.id}`}>
        <Plus />
        {t('care.logVisit')}
      </Link>
    </Button>
  ) : null;
  return (
    <Section title={t('care.visitsForCase')} action={query.data?.items.length ? action : null}>
      {query.isPending ? (
        <SkeletonList rows={2} />
      ) : query.isError ? (
        <ErrorState
          compact
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          compact
          icon={Footprints}
          tone="teal"
          title={t('care.noCaseVisitsTitle')}
          description={t('care.noCaseVisitsDescription')}
          action={action}
        />
      ) : (
        <DataList
          items={query.data.items}
          getKey={(visit) => visit.id}
          href={(visit) => `${base}/care/visits/${visit.id}`}
          leading={() => <ToneIcon icon={Footprints} tone="teal" size="sm" />}
          title={(visit) => formatDate(visit.visitDate, 'dateLong')}
          subtitle={(visit) =>
            [visit.location, visit.visitors.map((person) => personName(person)).join(', ')]
              .filter(Boolean)
              .join(' · ') || t('care.noVisitDetails')
          }
          trailing={(visit) =>
            visit.followUpNeeded ? (
              <span data-tone="warning" className="text-xs font-semibold text-tone-ink">
                {t('care.followUpNeeded')}
              </span>
            ) : null
          }
        />
      )}
    </Section>
  );
}

function CaseTasks({ careCase }: { careCase: CareCase }) {
  const { t } = useI18n();
  const { churchId } = useChurch();
  const query = useQuery(tasksQuery(churchId, { caseId: careCase.id }));
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CareTask | null>(null);
  const action = careCase.canManage ? (
    <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
      <Plus />
      {t('care.newTask')}
    </Button>
  ) : null;
  return (
    <Section title={t('care.tasksForCase')} action={query.data?.items.length ? action : null}>
      {query.isPending ? (
        <SkeletonList rows={2} />
      ) : query.isError ? (
        <ErrorState
          compact
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          compact
          icon={ListTodo}
          tone="rose"
          title={t('care.noCaseTasksTitle')}
          description={t('care.noCaseTasksDescription')}
          action={action}
        />
      ) : (
        <TaskList tasks={query.data.items} showAssignee onEdit={setEditing} />
      )}
      <TaskSheet open={creating} onOpenChange={setCreating} context={{ caseId: careCase.id }} />
      <TaskSheet
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        task={editing}
      />
    </Section>
  );
}

function CaseAid({ careCase }: { careCase: CareCase }) {
  const { t, formatDate, formatCurrency } = useI18n();
  const { churchId, base, access } = useChurch();
  const query = useQuery(aidListQuery(churchId, { caseId: careCase.id, limit: 50 }));
  const action = has(access, 'diakonia.manage') ? (
    <Button asChild size="sm" variant="outline">
      <Link to={`${base}/care/diakonia?new=1&caseId=${careCase.id}`}>
        <Plus />
        {t('care.recordAid')}
      </Link>
    </Button>
  ) : null;
  return (
    <Section title={t('care.aidForCase')} action={query.data?.items.length ? action : null}>
      {query.isPending ? (
        <SkeletonList rows={2} />
      ) : query.isError ? (
        <ErrorState
          compact
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          compact
          icon={HandCoins}
          tone="emerald"
          title={t('care.noCaseAidTitle')}
          action={action}
        />
      ) : (
        <DataList
          items={query.data.items}
          getKey={(aid) => aid.id}
          href={(aid) => `${base}/care/diakonia?aid=${aid.id}`}
          leading={() => <ToneIcon icon={HandCoins} tone="emerald" size="sm" />}
          title={(aid) => aid.description ?? formatDate(aid.givenAt, 'dateLong')}
          subtitle={(aid) => formatDate(aid.givenAt, 'dateLong')}
          trailing={(aid) =>
            aid.amount !== null ? (
              <span className="font-semibold text-foreground tabular">
                {formatCurrency(aid.amount)}
              </span>
            ) : null
          }
        />
      )}
    </Section>
  );
}
