import { fullName, type WorshipService } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Ban,
  BookOpen,
  CalendarCheck,
  Clock,
  ListOrdered,
  MapPin,
  Mic,
  Pencil,
  Printer,
  Send,
  StickyNote,
  Trash2,
  UsersRound,
} from 'lucide-react';
import { useState, type ComponentType, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert } from '@/components/ui/misc';
import { RowActions } from '@/components/ui/row-actions';
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { TabsContent, TabsList, TabsTrigger, UrlTabs } from '@/components/ui/tabs';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { serviceQuery, useDeleteService, useSaveService } from './api';
import { LiturgyEditor } from './liturgy-editor';
import { RosterPanel } from './roster-panel';
import { ServiceStatusBadge } from './worship-ui';
import { WORSHIP_TONE, preacherOf, useDuration } from './worship-lib';

/** The PATCH body that keeps everything but the status. */
const withStatus = (service: WorshipService, status: WorshipService['status']) => ({
  serviceTypeId: service.serviceTypeId,
  title: service.title,
  startsAt: service.startsAt,
  endsAt: service.endsAt,
  location: service.location,
  theme: service.theme,
  scriptureReadings: service.scriptureReadings,
  preacherPersonId: service.preacher?.id ?? null,
  preacherName: service.preacherName,
  notes: service.notes,
  status,
});

export function ServicePage() {
  const { serviceId = '' } = useParams();
  const { churchId, base } = useChurch();
  const { t, formatDate, formatTime } = useI18n();
  const navigate = useNavigate();
  const query = useQuery(serviceQuery(churchId, serviceId));
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null);
  const update = useMutationToast(useSaveService(churchId, serviceId), {
    success: (result) =>
      result.service.status === 'cancelled'
        ? t('worship.serviceCancelled')
        : t('worship.published'),
  });
  const remove = useMutationToast(useDeleteService(churchId), {
    success: t('worship.serviceDeleted'),
  });

  const crumbs = [
    { label: t('worship.nav'), to: `${base}/worship` },
    { label: t('worship.servicesTitle'), to: `${base}/worship/services` },
  ];

  if (query.isPending) {
    return (
      <Page size="wide">
        <SkeletonText lines={3} className="max-w-md" />
        <SkeletonList rows={6} avatar={false} />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page size="wide">
        <PageHeader title={t('worship.servicesTitle')} breadcrumbs={crumbs} />
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={
            isApiClientError(query.error) && query.error.status === 404
              ? undefined
              : () => void query.refetch()
          }
        />
      </Page>
    );
  }

  const detail = query.data;
  const { service, canManage } = detail;
  const preacher = preacherOf(service);

  return (
    <Page size="wide">
      <PageHeader
        title={service.title}
        eyebrow={service.serviceTypeName ?? undefined}
        tone={WORSHIP_TONE}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <CalendarCheck className="size-4" aria-hidden />
              {formatDate(service.startsAt, 'dateLong')}
            </span>
            <span className="inline-flex items-center gap-1.5 tabular">
              <Clock className="size-4" aria-hidden />
              {formatTime(service.startsAt)}
              {service.endsAt ? `–${formatTime(service.endsAt)}` : ''}
            </span>
            {service.location ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" aria-hidden />
                {service.location}
              </span>
            ) : null}
          </span>
        }
        breadcrumbs={[...crumbs, { label: service.title }]}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to={`${base}/worship/services/${service.id}/print`}>
                <Printer />
                <span className="hidden sm:inline">{t('worship.runSheet')}</span>
                <span className="sr-only sm:hidden">{t('worship.runSheet')}</span>
              </Link>
            </Button>
            {canManage ? (
              <>
                <Button asChild size="sm" variant="outline" className="hidden sm:inline-flex">
                  <Link to={`${base}/worship/services/${service.id}/edit`}>
                    <Pencil />
                    {t('worship.editService')}
                  </Link>
                </Button>
                <RowActions
                  label={t('common.moreActions')}
                  className="size-9"
                  actions={[
                    {
                      id: 'edit',
                      label: t('worship.editService'),
                      icon: Pencil,
                      onSelect: () => void navigate(`${base}/worship/services/${service.id}/edit`),
                    },
                    {
                      id: 'publish',
                      label:
                        service.status === 'cancelled'
                          ? t('worship.restoreService')
                          : t('worship.publish'),
                      icon: Send,
                      hidden: service.status === 'published',
                      onSelect: () => void update.run(withStatus(service, 'published')),
                    },
                    {
                      id: 'cancel',
                      label: t('worship.cancelService'),
                      icon: Ban,
                      destructive: true,
                      hidden: service.status === 'cancelled',
                      onSelect: () => setConfirm('cancel'),
                    },
                    {
                      id: 'delete',
                      label: t('worship.deleteService'),
                      icon: Trash2,
                      destructive: true,
                      onSelect: () => setConfirm('delete'),
                    },
                  ]}
                />
              </>
            ) : null}
          </>
        }
      />

      {service.status === 'cancelled' ? (
        <Alert variant="error" title={t('worship.cancelledBanner')} />
      ) : service.status === 'draft' ? (
        <Alert
          variant="info"
          title={t('worship.draftBanner')}
          action={
            canManage ? (
              <Button
                size="sm"
                loading={update.isPending}
                onClick={() => void update.run(withStatus(service, 'published'))}
              >
                {t('worship.publish')}
              </Button>
            ) : null
          }
        />
      ) : null}

      <Card>
        <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <Detail icon={StickyNote} label={t('worship.theme')}>
            {service.theme ? (
              <span className="font-medium italic">“{service.theme}”</span>
            ) : (
              <span className="text-muted-foreground">{t('worship.noTheme')}</span>
            )}
          </Detail>
          <Detail icon={BookOpen} label={t('worship.readings')}>
            {service.scriptureReadings.length > 0 ? (
              <span className="flex flex-wrap gap-1.5">
                {service.scriptureReadings.map((reading) => (
                  <span
                    key={reading}
                    data-tone="sky"
                    className="rounded-md bg-tone-soft px-2 py-0.5 text-sm font-medium text-tone-ink"
                  >
                    {reading}
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Detail>
          <Detail
            icon={Mic}
            label={
              service.preacher || !preacher ? t('worship.preacher') : t('worship.guestPreacher')
            }
          >
            {preacher ? (
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <EntityAvatar
                  name={service.preacher ? fullName(service.preacher) : preacher}
                  src={service.preacher?.photoUrl}
                  size="xs"
                />
                <span className="truncate">{preacher}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Detail>
          <Detail icon={UsersRound} label={t('worship.tabRoster')}>
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium tabular">
                {t('worship.rosterProgress', {
                  accepted: service.rosterAccepted,
                  total: service.rosterTotal,
                })}
              </span>
              <ServiceStatusBadge status={service.status} />
            </span>
          </Detail>
          {service.notes ? (
            <Detail
              icon={StickyNote}
              label={t('worship.notes')}
              className="sm:col-span-2 lg:col-span-4"
            >
              <span className="whitespace-pre-line">{service.notes}</span>
            </Detail>
          ) : null}
        </CardContent>
      </Card>

      <UrlTabs defaultValue="liturgy" values={['liturgy', 'roster']}>
        <TabsList variant="underline">
          <TabsTrigger value="liturgy">
            <ListOrdered />
            {t('worship.tabLiturgy')}
            <ServiceDurationHint minutes={service.totalMinutes} />
          </TabsTrigger>
          <TabsTrigger value="roster">
            <UsersRound />
            {t('worship.tabRoster')}
          </TabsTrigger>
        </TabsList>
        {/* The liturgy stays mounted so unsaved edits survive a look at the roster. */}
        <TabsContent value="liturgy" forceMount className="data-[state=inactive]:hidden">
          <LiturgyEditor
            service={service}
            items={detail.liturgy}
            canManage={canManage && service.status !== 'cancelled'}
          />
        </TabsContent>
        <TabsContent value="roster">
          <RosterPanel detail={detail} />
        </TabsContent>
      </UrlTabs>

      <ConfirmDialog
        open={confirm === 'cancel'}
        onOpenChange={(open) => setConfirm(open ? 'cancel' : null)}
        title={t('worship.cancelServiceTitle', { title: service.title })}
        description={t('worship.cancelServiceBody')}
        confirmLabel={t('worship.cancelServiceConfirm')}
        loading={update.isPending}
        onConfirm={async () => {
          if (await update.run(withStatus(service, 'cancelled'))) setConfirm(null);
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => setConfirm(open ? 'delete' : null)}
        title={t('worship.deleteServiceTitle', { title: service.title })}
        description={t('worship.deleteServiceBody')}
        confirmLabel={t('worship.deleteService')}
        confirmText={service.title}
        loading={remove.isPending}
        onConfirm={async () => {
          if (await remove.run(service.id)) {
            setConfirm(null);
            void navigate(`${base}/worship/services`, { replace: true });
          }
        }}
      />
    </Page>
  );
}

function ServiceDurationHint({ minutes }: { minutes: number }) {
  const duration = useDuration();
  if (minutes === 0) return null;
  return (
    <span className="text-xs font-normal text-muted-foreground tabular">· {duration(minutes)}</span>
  );
}

function Detail({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-overline mb-1.5 flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </p>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}
