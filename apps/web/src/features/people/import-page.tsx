import {
  PEOPLE_LIMITS,
  type PERSON_CSV_COLUMNS,
  type PersonImportResult,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RotateCcw,
  Upload,
  XCircle,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert, Segmented } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Stepper } from '@/components/ui/stepper';
import { useUnsavedChangesGuard } from '@/components/ui/unsaved-changes';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { cn } from '@/lib/utils';
import { fieldsQuery, saveBlob, useImportPeople } from './api';
import {
  guessTarget,
  mapRows,
  parseCsv,
  templateCsv,
  type ImportTarget,
  type ParsedCsv,
} from './csv';

const COLUMN_LABELS: Record<(typeof PERSON_CSV_COLUMNS)[number] | 'fullName', MessageKey> = {
  fullName: 'people.colFullName',
  firstName: 'people.firstName',
  lastName: 'people.lastName',
  gender: 'people.gender',
  birthDate: 'people.birthDate',
  email: 'people.emailLabel',
  phone: 'people.phone',
  address: 'people.address',
  membershipStatus: 'people.status',
  joinedAt: 'people.joinedAt',
  weddingDate: 'people.weddingDate',
  householdName: 'people.household',
  relationship: 'people.relationship',
  areaName: 'people.area',
  tags: 'people.tags',
  notes: 'people.notes',
};

type RowFilter = 'all' | 'problems' | 'duplicates';

/** CSV import: upload, map columns, review the dry run, then import. */
export function ImportPeoplePage() {
  const { churchId, base } = useChurch();
  const { t } = useI18n();
  const fields = useQuery(fieldsQuery(churchId));
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [targets, setTargets] = useState<ImportTarget[]>([]);
  const [preview, setPreview] = useState<PersonImportResult | null>(null);
  const [result, setResult] = useState<PersonImportResult | null>(null);
  const [allowed, setAllowed] = useState<number[]>([]);
  const [filter, setFilter] = useState<RowFilter>('all');
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const importer = useImportPeople(churchId);
  const run = useMutationToast(importer);
  const guard = useUnsavedChangesGuard(!!parsed && !result && !importer.isPending);

  const definitions = fields.data?.items ?? [];
  const mapped = useMemo(() => (parsed ? mapRows(parsed, targets) : []), [parsed, targets]);
  const hasName = targets.includes('firstName') || targets.includes('fullName');

  const readFile = async (file: File) => {
    if (
      !/\.(csv|txt)$/i.test(file.name) &&
      !file.type.includes('csv') &&
      file.type !== 'text/plain'
    ) {
      toast.error(t('people.importNotCsv'));
      return;
    }
    const csv = parseCsv(await file.text());
    if (csv.headers.length === 0 || csv.rows.length === 0) {
      toast.error(t('people.importEmptyFile'));
      return;
    }
    if (csv.rows.length > PEOPLE_LIMITS.importRowsMax) {
      toast.error(t('people.importTooMany', { max: PEOPLE_LIMITS.importRowsMax }));
      return;
    }
    setFileName(file.name);
    setParsed(csv);
    setTargets(csv.headers.map((header) => guessTarget(header, definitions)));
    setPreview(null);
    setResult(null);
    setAllowed([]);
    setStep(1);
  };

  const validate = async () => {
    const data = await run.run({ rows: mapped, dryRun: true, allowDuplicateRows: [] });
    if (!data) return;
    setPreview(data);
    setAllowed([]);
    setFilter(data.rows.some((row) => row.status !== 'ok') ? 'problems' : 'all');
    setStep(2);
  };

  const commit = async () => {
    const data = await run.run({ rows: mapped, dryRun: false, allowDuplicateRows: allowed });
    if (!data) return;
    setResult(data);
    setStep(3);
    toast.success(t('people.importDone', { count: data.created }));
  };

  const restart = () => {
    setStep(0);
    setParsed(null);
    setFileName(null);
    setPreview(null);
    setResult(null);
    setAllowed([]);
  };

  const counts = preview
    ? {
        ok: preview.rows.filter((row) => row.status === 'ok').length,
        duplicate: preview.rows.filter((row) => row.status === 'duplicate').length,
        invalid: preview.rows.filter((row) => row.status === 'invalid').length,
      }
    : null;
  const willCreate = counts ? counts.ok + allowed.length : 0;
  const shownRows = (preview?.rows ?? []).filter((row) =>
    filter === 'all'
      ? true
      : filter === 'duplicates'
        ? row.status === 'duplicate'
        : row.status !== 'ok' || row.issues.length > 0,
  );

  return (
    <Page>
      <PageHeader
        icon={Upload}
        tone="sky"
        breadcrumbs={[
          { label: t('people.title'), to: `${base}/people` },
          { label: t('people.importTitle') },
        ]}
        title={t('people.importTitle')}
        description={t('people.importDescription')}
      />
      <Stepper
        steps={[
          { id: 'upload', label: t('people.importStepUpload') },
          { id: 'map', label: t('people.importStepMap') },
          { id: 'review', label: t('people.importStepReview') },
          { id: 'done', label: t('people.importStepDone') },
        ]}
        current={step}
        onStepClick={result ? undefined : (index) => index < step && setStep(index)}
      />

      {step === 0 ? (
        <div className="flex flex-col gap-4">
          <label
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files[0];
              if (file) void readFile(file);
            }}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card/50 px-6 py-12 text-center transition-colors hover:border-primary/40 hover:bg-accent/30',
              dragging && 'border-primary bg-accent/50',
            )}
          >
            <span
              data-tone="sky"
              className="flex size-14 items-center justify-center rounded-2xl bg-tone-soft text-tone-ink"
            >
              <FileSpreadsheet className="size-7" aria-hidden />
            </span>
            <span className="text-base font-semibold">{t('people.importDrop')}</span>
            <span className="max-w-sm text-sm text-muted-foreground">
              {t('people.importDropHint', { max: PEOPLE_LIMITS.importRowsMax })}
            </span>
            <span className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-soft">
              <Upload className="size-4" aria-hidden /> {t('people.importChoose')}
            </span>
            <input
              ref={input}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
                event.target.value = '';
              }}
            />
          </label>
          <Card>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{t('people.importTemplate')}</p>
                <p className="text-sm text-muted-foreground">{t('people.importTemplateHint')}</p>
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  saveBlob(
                    new Blob([templateCsv(definitions)], { type: 'text/csv;charset=utf-8' }),
                    'templat-jemaat.csv',
                  )
                }
              >
                <Download /> {t('people.downloadTemplate')}
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {step === 1 && parsed ? (
        <Section
          title={t('people.importMapTitle', { file: fileName ?? '' })}
          description={t('people.importMapHint', { count: parsed.rows.length })}
        >
          <Card>
            <CardContent className="flex flex-col divide-y divide-border/60 py-1 sm:py-1">
              {parsed.headers.map((header, index) => (
                <div
                  key={`${header}-${index}`}
                  className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {header || t('people.importUnnamed', { number: index + 1 })}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {parsed.rows
                        .slice(0, 3)
                        .map((row) => row[index])
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </p>
                  </div>
                  <Select
                    aria-label={t('people.importTargetFor', { column: header })}
                    value={targets[index] ?? ''}
                    onChange={(event) =>
                      setTargets((current) =>
                        current.map((value, position) =>
                          position === index ? (event.target.value as ImportTarget) : value,
                        ),
                      )
                    }
                  >
                    <option value="">{t('people.importIgnore')}</option>
                    {(Object.keys(COLUMN_LABELS) as (keyof typeof COLUMN_LABELS)[]).map(
                      (column) => (
                        <option key={column} value={column}>
                          {t(COLUMN_LABELS[column])}
                        </option>
                      ),
                    )}
                    {definitions.map((field) => (
                      <option key={field.id} value={`field:${field.key}`}>
                        {t('people.importFieldOption', { label: field.label })}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>
          {!hasName ? <Alert variant="warning">{t('people.importNeedsName')}</Alert> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="ghost" onClick={restart}>
              <ArrowLeft /> {t('people.importOtherFile')}
            </Button>
            <Button onClick={() => void validate()} disabled={!hasName} loading={run.isPending}>
              {t('people.importValidate')} <ArrowRight />
            </Button>
          </div>
        </Section>
      ) : null}

      {step === 2 && preview && counts ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label={t('people.importReady')}
              value={counts.ok}
              icon={CheckCircle2}
              tone="success"
            />
            <StatCard
              label={t('people.importDuplicates')}
              value={counts.duplicate}
              icon={AlertTriangle}
              tone="warning"
            />
            <StatCard
              label={t('people.importInvalid')}
              value={counts.invalid}
              icon={XCircle}
              tone="danger"
            />
          </div>
          <Segmented<RowFilter>
            aria-label={t('common.filters')}
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'problems', label: t('people.importShowProblems') },
              { value: 'duplicates', label: t('people.importShowDuplicates') },
              { value: 'all', label: t('people.importShowAll') },
            ]}
          />
          {shownRows.length === 0 ? (
            <EmptyState
              compact
              icon={CheckCircle2}
              tone="success"
              title={t('people.importAllGood')}
            />
          ) : (
            <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
              {shownRows.slice(0, 200).map((row) => {
                const source = mapped[row.index] ?? {};
                const name =
                  [source.firstName, source.lastName].filter(Boolean).join(' ') ||
                  t('people.importNoName');
                const tone =
                  row.status === 'ok'
                    ? 'success'
                    : row.status === 'duplicate'
                      ? 'warning'
                      : 'danger';
                return (
                  <li key={row.index} className="flex items-start gap-3 px-4 py-3">
                    <span className="mt-0.5 w-10 shrink-0 text-xs text-muted-foreground tabular">
                      #{row.index + 2}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{name}</p>
                      {row.issues.map((issue, index) => (
                        <p key={index} className="text-xs text-muted-foreground">
                          <span className="font-mono">{issue.path}</span>: {issue.message}
                        </p>
                      ))}
                      {row.status === 'duplicate' ? (
                        <label className="mt-1.5 flex w-fit cursor-pointer items-center gap-2 text-xs font-medium">
                          <Checkbox
                            checked={allowed.includes(row.index)}
                            onCheckedChange={(checked) =>
                              setAllowed((current) =>
                                checked
                                  ? [...current, row.index]
                                  : current.filter((value) => value !== row.index),
                              )
                            }
                          />
                          {t('people.importAllowDuplicate')}
                        </label>
                      ) : null}
                    </div>
                    <StatusBadge size="sm" dot tone={tone}>
                      {t(
                        row.status === 'ok'
                          ? 'people.importStatusOk'
                          : row.status === 'duplicate'
                            ? 'people.importStatusDuplicate'
                            : 'people.importStatusInvalid',
                      )}
                    </StatusBadge>
                  </li>
                );
              })}
            </ul>
          )}
          {shownRows.length > 200 ? (
            <p className="text-center text-xs text-muted-foreground">
              {t('people.importMoreRows', { count: shownRows.length - 200 })}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="ghost" onClick={() => setStep(1)} disabled={run.isPending}>
              <ArrowLeft /> {t('people.importBackToMap')}
            </Button>
            <Button
              onClick={() => void commit()}
              disabled={willCreate === 0}
              loading={run.isPending}
            >
              <Upload /> {t('people.importCommit', { count: willCreate })}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 && result ? (
        <EmptyState
          icon={CheckCircle2}
          tone="success"
          title={t('people.importDone', { count: result.created })}
          description={t('people.importDoneHint', {
            skipped: result.rows.filter((row) => row.status !== 'created').length,
          })}
          action={
            <Button asChild>
              <Link to={`${base}/people?sort=-created`}>{t('people.importOpenDirectory')}</Link>
            </Button>
          }
          secondaryAction={
            <Button variant="outline" onClick={restart}>
              <RotateCcw /> {t('people.importAnother')}
            </Button>
          }
        />
      ) : null}
      {guard}
    </Page>
  );
}
