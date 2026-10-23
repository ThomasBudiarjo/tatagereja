import { fullName, type CheckinClass } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Pencil, Plus, School, Sparkles, Trash2, Users, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { AvatarGroup } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { RowActions } from '@/components/ui/row-actions';
import { SkeletonCards } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/states';
import { Switch } from '@/components/ui/switch';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { useUrlState } from '@/lib/use-url-state';
import { classesQuery, useCreateDefaultClasses, useDeleteClass } from './api';
import { CHECKIN_TONE, useAgeRange, useCheckinAccess } from './checkin-lib';
import { CheckinNav } from './checkin-ui';
import { ClassDialog, TeachersDialog } from './class-dialogs';

/** Sekolah Minggu classes by age, with their teachers, capacity and ratio. */
export function ClassesPage() {
  const { churchId, base } = useChurch();
  const { t } = useI18n();
  const { canManage } = useCheckinAccess();
  const [state, setState] = useUrlState({ inactive: false as boolean });
  const query = useQuery(classesQuery(churchId, true));
  const [editing, setEditing] = useState<CheckinClass | 'new' | null>(null);
  const [teachersOf, setTeachersOf] = useState<CheckinClass | null>(null);
  const [deleting, setDeleting] = useState<CheckinClass | null>(null);
  const setup = useMutationToast(useCreateDefaultClasses(churchId), {
    success: (result) =>
      result.created > 0
        ? t('checkin.defaultsCreated', { count: result.created })
        : t('checkin.defaultsNothing'),
  });
  const remove = useMutationToast(useDeleteClass(churchId), {
    success: t('checkin.classDeleted'),
  });

  const all = query.data?.items ?? [];
  const inactiveCount = all.filter((item) => !item.isActive).length;
  const items = state.inactive ? all : all.filter((item) => item.isActive);
  const nextSortOrder = (Math.max(0, ...all.map((item) => item.sortOrder)) || 0) + 10;

  return (
    <Page size="wide">
      <PageHeader
        title={t('checkin.classesTitle')}
        description={t('checkin.classesDescription')}
        breadcrumbs={[
          { label: t('checkin.nav'), to: `${base}/checkin` },
          { label: t('checkin.classesTitle') },
        ]}
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus />
              {t('checkin.newClass')}
            </Button>
          ) : null
        }
      />
      <CheckinNav />
      {inactiveCount > 0 ? (
        <label className="flex min-h-11 w-fit items-center gap-3 text-sm">
          <Switch checked={state.inactive} onCheckedChange={(inactive) => setState({ inactive })} />
          {t('checkin.showInactive', { count: inactiveCount })}
        </label>
      ) : null}

      {query.isPending ? (
        <SkeletonCards count={4} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={School}
          tone={CHECKIN_TONE}
          title={t('checkin.noClasses')}
          description={canManage ? t('checkin.noClassesManage') : t('checkin.noClassesOperate')}
          action={
            canManage ? (
              <Button loading={setup.isPending} onClick={() => void setup.run(undefined)}>
                <Sparkles />
                {t('checkin.setupAction')}
              </Button>
            ) : null
          }
          secondaryAction={
            canManage ? (
              <Button variant="outline" onClick={() => setEditing('new')}>
                <Plus />
                {t('checkin.newClass')}
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <li key={item.id}>
              <ClassCard
                item={item}
                canManage={canManage}
                onEdit={() => setEditing(item)}
                onTeachers={() => setTeachersOf(item)}
                onDelete={() => setDeleting(item)}
              />
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <>
          <ClassDialog
            item={editing && editing !== 'new' ? editing : undefined}
            open={!!editing}
            nextSortOrder={nextSortOrder}
            onOpenChange={(next) => {
              if (!next) setEditing(null);
            }}
          />
          {teachersOf ? (
            <TeachersDialog
              key={teachersOf.id}
              item={teachersOf}
              open
              onOpenChange={(next) => {
                if (!next) setTeachersOf(null);
              }}
            />
          ) : null}
          <ConfirmDialog
            open={!!deleting}
            onOpenChange={(next) => {
              if (!next) setDeleting(null);
            }}
            title={t('checkin.deleteClassTitle', { name: deleting?.name ?? '' })}
            description={t('checkin.deleteClassBody')}
            confirmLabel={t('common.delete')}
            loading={remove.isPending}
            onConfirm={async () => {
              if (deleting && (await remove.run(deleting.id))) setDeleting(null);
            }}
          />
        </>
      ) : null}
    </Page>
  );
}

function ClassCard({
  item,
  canManage,
  onEdit,
  onTeachers,
  onDelete,
}: {
  item: CheckinClass;
  canManage: boolean;
  onEdit: () => void;
  onTeachers: () => void;
  onDelete: () => void;
}) {
  const { t, formatNumber } = useI18n();
  const ageRange = useAgeRange();
  const ages = ageRange(item);
  return (
    <article className="flex h-full flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: item.color ? `${item.color}22` : undefined,
            color: item.color ?? undefined,
          }}
          data-tone={item.color ? undefined : CHECKIN_TONE}
        >
          <School className={item.color ? 'size-5' : 'size-5 text-tone-ink'} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="truncate">{item.name}</span>
            {!item.isActive ? (
              <StatusBadge tone="neutral" size="sm">
                {t('checkin.inactive')}
              </StatusBadge>
            ) : null}
          </h2>
          <p className="text-sm text-muted-foreground">{ages ?? t('checkin.allAges')}</p>
        </div>
        {canManage ? (
          <RowActions
            label={t('checkin.actionsFor', { name: item.name })}
            actions={[
              { id: 'edit', label: t('common.edit'), icon: Pencil, onSelect: onEdit },
              {
                id: 'teachers',
                label: t('checkin.manageTeachers'),
                icon: UsersRound,
                onSelect: onTeachers,
              },
              {
                id: 'delete',
                label: t('common.delete'),
                icon: Trash2,
                destructive: true,
                onSelect: onDelete,
              },
            ]}
          />
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-sunken/60 px-3 py-2">
          <dt className="text-xs text-muted-foreground">{t('checkin.capacity')}</dt>
          <dd className="font-semibold tabular">
            {item.capacity !== null ? formatNumber(item.capacity) : t('checkin.noLimit')}
          </dd>
        </div>
        <div className="rounded-lg bg-sunken/60 px-3 py-2">
          <dt className="text-xs text-muted-foreground">{t('checkin.ratio')}</dt>
          <dd className="font-semibold tabular">
            {item.maxChildrenPerTeacher !== null
              ? t('checkin.ratioValue', { max: item.maxChildrenPerTeacher })
              : t('checkin.noLimit')}
          </dd>
        </div>
      </dl>
      {item.location ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-3.5" aria-hidden />
          <span className="truncate">{item.location}</span>
        </p>
      ) : null}
      <div className="mt-auto flex items-center gap-3 border-t border-border/60 pt-3">
        {item.teachers.length > 0 ? (
          <>
            <AvatarGroup
              people={item.teachers.map((teacher) => ({
                id: teacher.id,
                name: fullName(teacher),
                src: teacher.photoUrl,
              }))}
              size="xs"
            />
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {item.teachers
                .map((teacher) =>
                  teacher.isLead
                    ? `${teacher.firstName} (${t('checkin.lead')})`
                    : teacher.firstName,
                )
                .join(', ')}
            </p>
          </>
        ) : (
          <p className="flex flex-1 items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="size-3.5" aria-hidden />
            {t('checkin.noTeachers')}
          </p>
        )}
        {canManage ? (
          <Button size="sm" variant="ghost" onClick={onTeachers}>
            {t('checkin.teachersButton')}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
