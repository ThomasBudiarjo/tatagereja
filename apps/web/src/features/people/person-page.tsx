import {
  GENDER_TEXT,
  MARITAL_STATUS_TEXT,
  ageOn,
  fullName,
  localize,
  type PersonPrivacy,
  type PersonProfile,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  EyeOff,
  HandCoins,
  HandHeart,
  Home,
  Link2,
  Lock,
  MapPin,
  Milestone,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  Trash2,
  Unlink,
  UserPlus,
} from 'lucide-react';
import type * as React from 'react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { ToneIcon } from '@/components/ui/status-badge';
import { Switch } from '@/components/ui/switch';
import { TabsContent, TabsList, TabsTrigger, UrlTabs } from '@/components/ui/tabs';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { isGone, useMutationToast } from '@/lib/use-mutation-toast';
import { personQuery, useDeletePerson, useSavePrivacy } from './api';
import { todayInZone } from './labels';
import {
  AddFamilyDialog,
  AssignAreaDialog,
  JoinHouseholdDialog,
  LinkAccountDialog,
  PrivateDetailsDialog,
} from './person-dialogs';
import { FamilyTab, GroupsTab, TimelineTab } from './person-tabs';
import {
  AreaChip,
  CelebrationBadges,
  ContactButtons,
  PersonStatusBadge,
  TagChip,
} from './people-ui';

type DialogName = 'private' | 'link' | 'family' | 'household' | 'area' | 'delete' | null;

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium break-words">{value}</dd>
    </div>
  );
}

function PersonSkeleton() {
  return (
    <Page size="wide">
      <Skeleton className="h-4 w-32" />
      <div className="flex items-center gap-4">
        <Skeleton className="size-20 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="h-11 w-full rounded-xl" />
      <SkeletonText lines={6} />
    </Page>
  );
}

export function PersonPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { churchId, base, church } = useChurch();
  const { t } = useI18n();
  const navigate = useNavigate();
  const query = useQuery(personQuery(churchId, id));
  const remove = useDeletePerson(churchId);
  const removal = useMutationToast(remove);
  const [dialog, setDialog] = useState<DialogName>(null);
  const today = todayInZone(church.timezone);

  if (query.isPending) return <PersonSkeleton />;
  if (query.isError) {
    return (
      <Page>
        <PageHeader backTo={`${base}/people`} title={t('people.person')} />
        <ErrorState
          error={query.error}
          title={isGone(query.error) ? t('people.goneTitle') : undefined}
          message={getErrorMessage(query.error)}
          onRetry={isGone(query.error) ? undefined : () => void query.refetch()}
        />
      </Page>
    );
  }

  const profile = query.data;
  const { person } = profile;
  const name = fullName(person);
  const open = (name: DialogName) => () => setDialog(name);
  const close = (next: boolean) => {
    if (!next) setDialog(null);
  };
  const menu = [
    profile.canAddFamily
      ? { id: 'family', icon: UserPlus, label: t('people.addFamily'), onSelect: open('family') }
      : null,
    profile.canManageHousehold
      ? {
          id: 'household',
          icon: Home,
          label: profile.household ? t('people.moveHousehold') : t('people.joinHousehold'),
          onSelect: open('household'),
        }
      : null,
    profile.canAssignArea
      ? { id: 'area', icon: MapPin, label: t('people.assignArea'), onSelect: open('area') }
      : null,
    profile.canLinkUser
      ? {
          id: 'link',
          icon: person.userId ? Unlink : Link2,
          label: person.userId ? t('people.changeAccount') : t('people.linkAccount'),
          onSelect: open('link'),
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => !!item);
  const showMenu = menu.length > 0 || profile.canDelete;

  const tabs = ['overview', 'family', 'groups', 'timeline'] as const;
  const links = [
    profile.links.care
      ? {
          to: `${base}/care?personId=${person.id}`,
          icon: HandHeart,
          tone: 'rose' as const,
          label: t('people.linkCare'),
          value: t('people.linkCareCount', { count: profile.links.care.open }),
        }
      : null,
    profile.links.giving
      ? {
          to: `${base}/finance?personId=${person.id}`,
          icon: HandCoins,
          tone: 'emerald' as const,
          label: t('people.linkGiving'),
          value: t('people.linkGivingCount', { count: profile.links.giving.count }),
        }
      : null,
    profile.links.records
      ? {
          to: `${base}/records?personId=${person.id}`,
          icon: Milestone,
          tone: 'violet' as const,
          label: t('people.linkRecords'),
          value: t('people.linkRecordsCount', { count: profile.links.records.count }),
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => !!item);

  return (
    <Page size="wide">
      <PageHeader
        breadcrumbs={[{ label: t('people.title'), to: `${base}/people` }, { label: name }]}
        title={<span className="sr-only">{name}</span>}
        documentTitle={name}
        className="-mb-2"
        actions={
          <>
            {profile.canEdit ? (
              <Button asChild size="sm" variant="outline">
                <Link to={`${base}/people/${person.id}/edit`}>
                  <Pencil /> {t('common.edit')}
                </Link>
              </Button>
            ) : null}
            {showMenu ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="size-9"
                    aria-label={t('common.moreActions')}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-56">
                  {menu.map((item) => (
                    <DropdownMenuItem key={item.id} onSelect={item.onSelect}>
                      <item.icon /> {item.label}
                    </DropdownMenuItem>
                  ))}
                  {profile.canDelete ? (
                    <>
                      {menu.length > 0 ? <DropdownMenuSeparator /> : null}
                      <DropdownMenuItem destructive onSelect={open('delete')}>
                        <Trash2 /> {t('people.deletePerson')}
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        }
      />

      <ProfileHero profile={profile} today={today} />

      {links.length > 0 ? (
        <div
          className="grid gap-2 sm:gap-3"
          style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}
        >
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="pressable flex min-h-11 flex-col items-start gap-2 rounded-xl border border-border/70 bg-card p-3 shadow-soft outline-none hover:border-border focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:flex-row sm:items-center sm:gap-3 sm:p-3.5"
            >
              <ToneIcon icon={link.icon} tone={link.tone} size="sm" />
              <span className="w-full min-w-0">
                <span className="block text-xs leading-snug font-semibold sm:text-sm">
                  {link.label}
                </span>
                <span className="block text-xs leading-snug text-muted-foreground">
                  {link.value}
                </span>
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      <UrlTabs defaultValue="overview" values={tabs}>
        <TabsList variant="underline">
          <TabsTrigger value="overview">{t('people.tabOverview')}</TabsTrigger>
          <TabsTrigger value="family">
            {t('people.tabFamily')}
            {profile.household ? (
              <span className="rounded-full bg-muted px-1.5 text-xs tabular">
                {profile.household.members.length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="groups">
            {t('people.tabGroups')}
            {profile.groups.length > 0 ? (
              <span className="rounded-full bg-muted px-1.5 text-xs tabular">
                {profile.groups.length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="timeline">{t('people.tabTimeline')}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab
            profile={profile}
            today={today}
            onEditPrivate={open('private')}
            onLink={open('link')}
          />
        </TabsContent>
        <TabsContent value="family">
          <FamilyTab
            profile={profile}
            onAddFamily={profile.canAddFamily ? open('family') : undefined}
            onJoinHousehold={profile.canManageHousehold ? open('household') : undefined}
          />
        </TabsContent>
        <TabsContent value="groups">
          <GroupsTab profile={profile} />
        </TabsContent>
        <TabsContent value="timeline">
          <TimelineTab profile={profile} />
        </TabsContent>
      </UrlTabs>

      {profile.canEditPrivate ? (
        <PrivateDetailsDialog
          key={profile.privateDetails?.updatedAt ?? 'new'}
          churchId={churchId}
          personId={person.id}
          details={profile.privateDetails}
          open={dialog === 'private'}
          onOpenChange={close}
        />
      ) : null}
      {profile.canLinkUser ? (
        <LinkAccountDialog
          key={person.userId ?? 'unlinked'}
          churchId={churchId}
          personId={person.id}
          currentUserId={person.userId}
          open={dialog === 'link'}
          onOpenChange={close}
        />
      ) : null}
      {profile.canAddFamily ? (
        <AddFamilyDialog
          churchId={churchId}
          profile={profile}
          open={dialog === 'family'}
          onOpenChange={close}
        />
      ) : null}
      {profile.canManageHousehold ? (
        <JoinHouseholdDialog
          churchId={churchId}
          profile={profile}
          open={dialog === 'household'}
          onOpenChange={close}
        />
      ) : null}
      {profile.canAssignArea ? (
        <AssignAreaDialog
          key={`${profile.area?.id ?? 'none'}-${profile.areaSource ?? ''}`}
          churchId={churchId}
          profile={profile}
          open={dialog === 'area'}
          onOpenChange={close}
        />
      ) : null}
      {profile.canDelete ? (
        <ConfirmDialog
          open={dialog === 'delete'}
          onOpenChange={close}
          title={t('people.deleteTitle', { name })}
          description={t('people.deleteDescription')}
          confirmText={name}
          confirmLabel={t('people.deletePerson')}
          loading={removal.isPending}
          onConfirm={async () => {
            if (await removal.run(person.id)) {
              toast.success(t('people.deleted', { name }));
              navigate(`${base}/people`, { replace: true });
            }
          }}
        />
      ) : null}
    </Page>
  );
}

function ProfileHero({ profile, today }: { profile: PersonProfile; today: string }) {
  const { base } = useChurch();
  const { t, locale } = useI18n();
  const { person } = profile;
  const name = fullName(person);
  const years = person.birthDate ? ageOn(person.birthDate, today) : null;
  return (
    <Card className="overflow-hidden">
      <div
        aria-hidden
        className="h-16 bg-gradient-to-r from-sky-500/15 via-primary/10 to-violet-500/15 sm:h-20"
      />
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <EntityAvatar
          name={name}
          src={person.photoUrl}
          size="xl"
          className="-mt-12 shrink-0 ring-4 ring-card"
        />
        <div className="min-w-0 flex-1">
          {/* The page heading (for screen readers) is in the header above. */}
          <p
            aria-hidden
            className="text-2xl leading-tight font-bold tracking-tight text-balance sm:text-[1.75rem]"
          >
            {name}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <PersonStatusBadge status={person.membershipStatus} />
            <CelebrationBadges
              birthDate={person.birthDate}
              weddingDate={person.weddingDate}
              today={today}
            />
            {years !== null ? (
              <span className="text-sm text-muted-foreground">
                {t('common.years', { count: years })} ·{' '}
                {localize(GENDER_TEXT[person.gender], locale)}
              </span>
            ) : null}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {profile.household ? (
              <Link
                to={`${base}/households/${profile.household.id}`}
                className="inline-flex h-6 items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
              >
                <Home className="size-3.5" aria-hidden /> {profile.household.name}
              </Link>
            ) : null}
            {profile.area ? (
              <Link
                to={`${base}/areas/${profile.area.id}`}
                className="rounded-full transition-opacity hover:opacity-80"
              >
                <AreaChip area={profile.area} />
              </Link>
            ) : null}
            {profile.tags.map((tag) => (
              <TagChip key={tag.id} tag={tag} />
            ))}
          </div>
        </div>
        <ContactButtons phone={person.phone} email={person.email} className="sm:self-center" />
      </CardContent>
      {profile.hiddenFields.length > 0 ? (
        <p className="flex items-center gap-2 border-t border-border/60 bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
          <EyeOff className="size-3.5 shrink-0" aria-hidden />
          {t('people.hiddenNotice')}
        </p>
      ) : null}
    </Card>
  );
}

function OverviewTab({
  profile,
  today,
  onEditPrivate,
  onLink,
}: {
  profile: PersonProfile;
  today: string;
  onEditPrivate: () => void;
  onLink: () => void;
}) {
  const { t, locale, formatDate } = useI18n();
  const { person, privateDetails } = profile;
  const years = person.birthDate ? ageOn(person.birthDate, today) : null;
  const visibleFields = profile.customFields.filter(
    (item) => item.value !== null && item.value !== '',
  );
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="flex min-w-0 flex-col gap-5">
        <Section title={t('people.details')}>
          <Card>
            <CardContent className="py-2 sm:py-2">
              <dl className="divide-y divide-border/60">
                <DetailRow
                  label={t('people.gender')}
                  value={localize(GENDER_TEXT[person.gender], locale)}
                />
                <DetailRow
                  label={t('people.birthDate')}
                  value={
                    person.birthDate
                      ? `${formatDate(person.birthDate, 'dateLong')}${years !== null ? ` · ${t('common.years', { count: years })}` : ''}`
                      : null
                  }
                />
                <DetailRow
                  label={t('people.weddingDate')}
                  value={person.weddingDate ? formatDate(person.weddingDate, 'dateLong') : null}
                />
                <DetailRow label={t('people.phone')} value={person.phone} />
                <DetailRow label={t('people.emailLabel')} value={person.email} />
                <DetailRow label={t('people.address')} value={person.address} />
                <DetailRow
                  label={t('people.joinedAt')}
                  value={person.joinedAt ? formatDate(person.joinedAt, 'dateShort') : null}
                />
                <DetailRow label={t('people.notes')} value={person.notes} />
                <DetailRow
                  label={t('people.addedOn')}
                  value={formatDate(person.createdAt, 'dateShort')}
                />
              </dl>
            </CardContent>
          </Card>
        </Section>

        {visibleFields.length > 0 ? (
          <Section title={t('people.customFields')}>
            <Card>
              <CardContent className="py-2 sm:py-2">
                <dl className="divide-y divide-border/60">
                  {visibleFields.map((item) => (
                    <DetailRow
                      key={item.field.id}
                      label={item.field.label}
                      value={
                        item.field.type === 'checkbox'
                          ? item.value === 'true'
                            ? t('common.yes')
                            : t('common.no')
                          : item.field.type === 'date' && item.value
                            ? formatDate(item.value, 'dateShort')
                            : item.value
                      }
                    />
                  ))}
                </dl>
              </CardContent>
            </Card>
          </Section>
        ) : null}

        {profile.canViewPrivate ? (
          <Section
            title={t('people.privateDetails')}
            icon={Lock}
            action={
              profile.canEditPrivate ? (
                <Button size="sm" variant="ghost" onClick={onEditPrivate}>
                  <Pencil /> {privateDetails ? t('common.edit') : t('common.add')}
                </Button>
              ) : null
            }
          >
            <Card className="border-dashed">
              <CardContent className="py-2 sm:py-2">
                {privateDetails ? (
                  <dl className="divide-y divide-border/60">
                    <DetailRow
                      label={t('people.maritalStatus')}
                      value={localize(MARITAL_STATUS_TEXT[privateDetails.maritalStatus], locale)}
                    />
                    <DetailRow
                      label={t('people.baptismDate')}
                      value={
                        privateDetails.baptismDate
                          ? formatDate(privateDetails.baptismDate, 'dateShort')
                          : null
                      }
                    />
                    <DetailRow label={t('people.nationalId')} value={privateDetails.nationalId} />
                    <DetailRow
                      label={t('people.emergencyName')}
                      value={privateDetails.emergencyContactName}
                    />
                    <DetailRow
                      label={t('people.emergencyPhone')}
                      value={privateDetails.emergencyContactPhone}
                    />
                    <DetailRow
                      label={t('people.medicalNotes')}
                      value={privateDetails.medicalNotes}
                    />
                    <DetailRow
                      label={t('people.privateNotes')}
                      value={privateDetails.privateNotes}
                    />
                  </dl>
                ) : (
                  <p className="py-3 text-sm text-muted-foreground">
                    {t('people.noPrivateDetails')}
                  </p>
                )}
              </CardContent>
            </Card>
          </Section>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        {profile.privacy ? <PrivacyCard profile={profile} privacy={profile.privacy} /> : null}
        {profile.canLinkUser || profile.linkedUser ? (
          <Section title={t('people.loginAccount')}>
            <Card>
              <CardContent className="flex flex-col gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {profile.linkedUser ? profile.linkedUser.name : t('people.noAccount')}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {profile.linkedUser ? profile.linkedUser.email : t('people.noAccountHint')}
                  </p>
                </div>
                {profile.canLinkUser ? (
                  <Button variant="outline" size="sm" className="w-fit" onClick={onLink}>
                    {profile.linkedUser ? <Unlink /> : <Link2 />}
                    {profile.linkedUser ? t('people.changeAccount') : t('people.linkAccount')}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          </Section>
        ) : null}
      </div>
    </div>
  );
}

const PRIVACY_TOGGLES: {
  key: keyof PersonPrivacy;
  label: 'people.showPhone' | 'people.showEmail' | 'people.showAddress' | 'people.showBirthday';
}[] = [
  { key: 'showPhone', label: 'people.showPhone' },
  { key: 'showEmail', label: 'people.showEmail' },
  { key: 'showAddress', label: 'people.showAddress' },
  { key: 'showBirthday', label: 'people.showBirthday' },
];

/** Directory privacy: each switch saves at once and rolls back if the server refuses. */
function PrivacyCard({ profile, privacy }: { profile: PersonProfile; privacy: PersonPrivacy }) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const save = useSavePrivacy(churchId, profile.person.id);
  const change = (next: PersonPrivacy) =>
    save.mutate(next, {
      onSuccess: () => toast.success(t('people.privacySaved'), { id: 'privacy-saved' }),
      onError: (error) => toast.error(getErrorMessage(error)),
    });
  return (
    <Section title={t('people.privacy')} icon={ShieldCheck} description={t('people.privacyHint')}>
      <Card>
        <CardContent className="flex flex-col divide-y divide-border/60 py-1 sm:py-1">
          {PRIVACY_TOGGLES.map((toggle) => {
            const id = `privacy-${toggle.key}`;
            return (
              <label
                key={toggle.key}
                htmlFor={id}
                className="flex min-h-12 cursor-pointer items-center justify-between gap-3 py-2 text-sm"
              >
                <span>{t(toggle.label)}</span>
                <Switch
                  id={id}
                  checked={privacy[toggle.key]}
                  onCheckedChange={(checked) => change({ ...privacy, [toggle.key]: checked })}
                />
              </label>
            );
          })}
        </CardContent>
      </Card>
    </Section>
  );
}
