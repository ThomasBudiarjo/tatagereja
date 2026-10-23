import {
  ALERT_SEVERITY_LABELS,
  CHILD_ALERT_KIND_LABELS,
  fullName,
  localize,
  type AuthorizedPickup,
  type CheckinChildDetail,
  type ChildAlert,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Baby,
  CalendarCheck,
  Contact,
  History,
  Pencil,
  Phone,
  Plus,
  School,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { RowActions } from '@/components/ui/row-actions';
import { Select } from '@/components/ui/select';
import { SkeletonList, SkeletonStats, SkeletonText } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/states';
import { Switch } from '@/components/ui/switch';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { isGone, useMutationToast } from '@/lib/use-mutation-toast';
import { useUrlState } from '@/lib/use-url-state';
import {
  childAttendanceQuery,
  childQuery,
  classesQuery,
  useDeleteAlert,
  useDeletePickup,
  useSetChildProfile,
  useToggleAlert,
} from './api';
import { ALERT_KIND_ICONS, CHECKIN_TONE, SEVERITY_TONES, useCheckinAccess } from './checkin-lib';
import { ChildAvatar } from './checkin-ui';
import { ChildAlertDialog, PickupDialog } from './child-dialogs';

/**
 * One child: alerts, the people allowed to pick them up, the usual class and the attendance
 * history. Guardians open their own children here; volunteers every child.
 */
export function ChildPage() {
  const { personId = '' } = useParams();
  const { churchId, base } = useChurch();
  const { t } = useI18n();
  const { canOperate } = useCheckinAccess();
  const query = useQuery(childQuery(churchId, personId));
  const breadcrumbs = canOperate
    ? [
        { label: t('checkin.nav'), to: `${base}/checkin` },
        { label: t('checkin.childrenTitle'), to: `${base}/checkin/children` },
      ]
    : [{ label: t('checkin.myChildrenTitle'), to: `${base}/checkin/me` }];

  if (query.isPending) {
    return (
      <Page>
        <PageHeader title={t('checkin.childTitle')} breadcrumbs={breadcrumbs} />
        <SkeletonStats count={2} />
        <SkeletonText lines={4} />
        <SkeletonList rows={3} />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page>
        <PageHeader title={t('checkin.childTitle')} breadcrumbs={breadcrumbs} />
        {isGone(query.error) ? (
          <EmptyState
            icon={Baby}
            tone={CHECKIN_TONE}
            title={t('checkin.childNotFound')}
            description={t('checkin.childNotFoundHint')}
            action={
              <Button asChild variant="outline">
                <Link to={breadcrumbs[breadcrumbs.length - 1]!.to}>
                  {breadcrumbs[breadcrumbs.length - 1]!.label}
                </Link>
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
  return <ChildDetail detail={query.data} breadcrumbs={breadcrumbs} />;
}

function ChildDetail({
  detail,
  breadcrumbs,
}: {
  detail: CheckinChildDetail;
  breadcrumbs: { label: string; to: string }[];
}) {
  const { churchId } = useChurch();
  const { t, formatDate, formatRelative, formatNumber } = useI18n();
  const { child, canEdit } = detail;
  const name = fullName(child);
  const [alertDialog, setAlertDialog] = useState<ChildAlert | 'new' | null>(null);
  const [pickupDialog, setPickupDialog] = useState<AuthorizedPickup | 'new' | null>(null);
  const [deletingAlert, setDeletingAlert] = useState<ChildAlert | null>(null);
  const [deletingPickup, setDeletingPickup] = useState<AuthorizedPickup | null>(null);
  const removeAlert = useMutationToast(useDeleteAlert(churchId, child.id), {
    success: t('checkin.alertDeleted'),
  });
  const removePickup = useMutationToast(useDeletePickup(churchId, child.id), {
    success: t('checkin.pickupDeleted'),
  });
  const active = detail.alerts.filter((alert) => alert.isActive).length;

  return (
    <Page>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <ChildAvatar child={child} alerts={child.alerts} size="lg" />
            <span className="min-w-0">{name}</span>
          </span>
        }
        documentTitle={name}
        description={[
          child.age !== null ? t('checkin.ageYears', { count: child.age }) : null,
          child.birthDate ? formatDate(child.birthDate, 'dateShort') : null,
          child.householdName,
        ]
          .filter(Boolean)
          .join(' · ')}
        breadcrumbs={[...breadcrumbs, { label: name }]}
      />

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label={t('checkin.attendanceCount')}
          value={formatNumber(detail.attendanceCount)}
          icon={CalendarCheck}
          tone={CHECKIN_TONE}
        />
        <StatCard
          label={t('checkin.lastCheckIn')}
          value={
            <span className="text-lg sm:text-xl">
              {detail.lastCheckedInAt ? formatRelative(detail.lastCheckedInAt) : '—'}
            </span>
          }
          hint={
            detail.lastCheckedInAt ? formatDate(detail.lastCheckedInAt, 'dateShort') : undefined
          }
          icon={History}
          tone="sky"
        />
      </div>

      <Section
        title={t('checkin.alertsTitle')}
        description={t('checkin.alertsDescription')}
        icon={TriangleAlert}
        action={
          canEdit ? (
            <Button size="sm" variant="outline" onClick={() => setAlertDialog('new')}>
              <Plus />
              {t('checkin.addAlert')}
            </Button>
          ) : null
        }
      >
        {detail.alerts.length === 0 ? (
          <EmptyState
            compact
            icon={ShieldCheck}
            tone="success"
            title={t('checkin.noAlerts')}
            description={canEdit ? t('checkin.noAlertsEdit') : undefined}
          />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {detail.alerts.map((alert) => (
              <AlertRow
                key={alert.id}
                personId={child.id}
                alert={alert}
                canEdit={canEdit}
                onEdit={() => setAlertDialog(alert)}
                onDelete={() => setDeletingAlert(alert)}
              />
            ))}
          </ul>
        )}
        {active === 0 && detail.alerts.length > 0 ? (
          <p className="text-xs text-muted-foreground">{t('checkin.noActiveAlerts')}</p>
        ) : null}
      </Section>

      <Section
        title={t('checkin.pickupTitle')}
        description={t('checkin.pickupDescription')}
        icon={Contact}
        action={
          canEdit ? (
            <Button size="sm" variant="outline" onClick={() => setPickupDialog('new')}>
              <Plus />
              {t('checkin.addPickup')}
            </Button>
          ) : null
        }
      >
        <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
          {detail.guardians.map((guardian) => (
            <li key={guardian.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
              <EntityAvatar name={fullName(guardian)} src={guardian.photoUrl} size="sm" />
              <span className="min-w-0 flex-1 truncate font-medium">{fullName(guardian)}</span>
              <StatusBadge tone={CHECKIN_TONE} size="sm">
                {t('checkin.guardian')}
              </StatusBadge>
            </li>
          ))}
          {detail.pickups.map((pickup) => (
            <li key={pickup.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
              <EntityAvatar name={pickup.name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{pickup.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[pickup.relationship, pickup.notes].filter(Boolean).join(' · ') ||
                    t('checkin.authorizedPickup')}
                </span>
              </span>
              {pickup.phone ? (
                <Button asChild size="icon" variant="ghost">
                  <a
                    href={`tel:${pickup.phone}`}
                    aria-label={t('checkin.callPerson', { name: pickup.name })}
                  >
                    <Phone />
                  </a>
                </Button>
              ) : null}
              {canEdit ? (
                <RowActions
                  label={t('checkin.actionsFor', { name: pickup.name })}
                  actions={[
                    {
                      id: 'edit',
                      label: t('common.edit'),
                      icon: Pencil,
                      onSelect: () => setPickupDialog(pickup),
                    },
                    {
                      id: 'delete',
                      label: t('common.remove'),
                      icon: Trash2,
                      destructive: true,
                      onSelect: () => setDeletingPickup(pickup),
                    },
                  ]}
                />
              ) : null}
            </li>
          ))}
          {detail.guardians.length === 0 && detail.pickups.length === 0 ? (
            <li className="px-4 py-5 text-center text-sm text-muted-foreground">
              {t('checkin.noPickups')}
            </li>
          ) : null}
        </ul>
      </Section>

      <UsualClass detail={detail} />
      <AttendanceHistory personId={child.id} />

      {canEdit ? (
        <>
          <ChildAlertDialog
            personId={child.id}
            childName={child.firstName}
            alert={alertDialog && alertDialog !== 'new' ? alertDialog : undefined}
            open={!!alertDialog}
            onOpenChange={(next) => {
              if (!next) setAlertDialog(null);
            }}
          />
          <PickupDialog
            personId={child.id}
            childName={child.firstName}
            pickup={pickupDialog && pickupDialog !== 'new' ? pickupDialog : undefined}
            open={!!pickupDialog}
            onOpenChange={(next) => {
              if (!next) setPickupDialog(null);
            }}
          />
          <ConfirmDialog
            open={!!deletingAlert}
            onOpenChange={(next) => {
              if (!next) setDeletingAlert(null);
            }}
            title={t('checkin.deleteAlertTitle')}
            description={t('checkin.deleteAlertBody', { name: child.firstName })}
            confirmLabel={t('common.delete')}
            loading={removeAlert.isPending}
            onConfirm={async () => {
              if (deletingAlert && (await removeAlert.run(deletingAlert.id)))
                setDeletingAlert(null);
            }}
          />
          <ConfirmDialog
            open={!!deletingPickup}
            onOpenChange={(next) => {
              if (!next) setDeletingPickup(null);
            }}
            title={t('checkin.deletePickupTitle', { name: deletingPickup?.name ?? '' })}
            description={t('checkin.deletePickupBody', { child: child.firstName })}
            confirmLabel={t('common.remove')}
            loading={removePickup.isPending}
            onConfirm={async () => {
              if (deletingPickup && (await removePickup.run(deletingPickup.id)))
                setDeletingPickup(null);
            }}
          />
        </>
      ) : null}
    </Page>
  );
}

function AlertRow({
  personId,
  alert,
  canEdit,
  onEdit,
  onDelete,
}: {
  personId: string;
  alert: ChildAlert;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { churchId } = useChurch();
  const { t, locale, formatRelative } = useI18n();
  const toggle = useMutationToast(useToggleAlert(churchId, personId), {
    success: (result) =>
      result.alert.isActive ? t('checkin.alertTurnedOn') : t('checkin.alertTurnedOff'),
  });
  const Icon = ALERT_KIND_ICONS[alert.kind];
  return (
    <li
      data-tone={alert.isActive ? SEVERITY_TONES[alert.severity] : 'neutral'}
      className="flex items-start gap-3 rounded-xl border border-tone/25 bg-card p-3.5 shadow-soft transition-opacity"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-tone-soft text-tone-ink">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className={alert.isActive ? 'min-w-0 flex-1' : 'min-w-0 flex-1 opacity-60'}>
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold">
            {localize(CHILD_ALERT_KIND_LABELS[alert.kind], locale)}
          </span>
          <StatusBadge tone={SEVERITY_TONES[alert.severity]} size="sm">
            {localize(ALERT_SEVERITY_LABELS[alert.severity], locale)}
          </StatusBadge>
          {!alert.isActive ? (
            <StatusBadge tone="neutral" size="sm">
              {t('checkin.inactive')}
            </StatusBadge>
          ) : null}
        </p>
        <p className="mt-1 text-sm text-pretty whitespace-pre-line">{alert.description}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('checkin.updated', { when: formatRelative(alert.updatedAt) })}
        </p>
      </div>
      {canEdit ? (
        <div className="flex shrink-0 items-center gap-1">
          <Switch
            checked={alert.isActive}
            disabled={toggle.isPending}
            onCheckedChange={() => void toggle.run(alert)}
            aria-label={t('checkin.alertActive')}
          />
          <RowActions
            label={t('checkin.alertActions')}
            actions={[
              { id: 'edit', label: t('common.edit'), icon: Pencil, onSelect: onEdit },
              {
                id: 'delete',
                label: t('common.delete'),
                icon: Trash2,
                destructive: true,
                onSelect: onDelete,
              },
            ]}
          />
        </div>
      ) : null}
    </li>
  );
}

/** The class a child usually goes to; coordinators change it. */
function UsualClass({ detail }: { detail: CheckinChildDetail }) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const { canManage, canOperate } = useCheckinAccess();
  const classes = useQuery({ ...classesQuery(churchId, false), enabled: canOperate });
  const save = useMutationToast(useSetChildProfile(churchId, detail.child.id), {
    success: t('checkin.usualClassSaved'),
  });
  if (!canOperate) return null;
  const items = classes.data?.items ?? [];
  const suggested = items.find((item) => item.id === detail.child.suggestedClassId);
  return (
    <Section title={t('checkin.usualClass')} icon={School}>
      <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card p-4 shadow-soft">
        {canManage ? (
          <Select
            aria-label={t('checkin.usualClass')}
            value={detail.child.defaultClassId ?? ''}
            disabled={save.isPending || classes.isPending}
            onChange={(event) => void save.run({ defaultClassId: event.target.value || null })}
          >
            <option value="">{t('checkin.classByAge')}</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {suggested
            ? t('checkin.goesTo', { name: suggested.name })
            : t('checkin.noSuggestedClass')}
        </p>
      </div>
    </Section>
  );
}

function AttendanceHistory({ personId }: { personId: string }) {
  const { churchId } = useChurch();
  const { t, formatDate, formatTime } = useI18n();
  const [state, setState] = useUrlState({ page: 1 });
  const query = useQuery(childAttendanceQuery(churchId, personId, state.page));
  return (
    <Section title={t('checkin.historyTitle')} icon={History}>
      {query.isPending ? (
        <SkeletonList rows={3} avatar={false} />
      ) : query.isError ? (
        <ErrorState
          compact
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState compact icon={History} tone={CHECKIN_TONE} title={t('checkin.noHistory')} />
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
            {query.data.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {formatDate(item.date, 'date')} · {item.sessionName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.className} · {formatTime(item.checkedInAt)}
                    {item.checkedOutAt ? `–${formatTime(item.checkedOutAt)}` : ''}
                    {item.pickupName
                      ? ` · ${t('checkin.pickedUpByShort', { name: item.pickupName })}`
                      : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            page={query.data.page}
            pageSize={query.data.limit}
            total={query.data.total}
            onPageChange={(page) => setState({ page })}
          />
        </div>
      )}
    </Section>
  );
}
