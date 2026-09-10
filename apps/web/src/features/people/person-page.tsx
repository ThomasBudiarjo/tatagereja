import {
  ATTENDANCE_STATUS_LABELS,
  GENDER_LABELS,
  MARITAL_STATUSES,
  MARITAL_STATUS_LABELS,
  PERSON_MEMBERSHIP_STATUS_LABELS,
  fullName,
  personPrivateDetailsInputSchema,
  type PersonPrivateDetailsInput,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Link2, Lock, Pencil, Trash2, Unlink } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { ListGroup, ListRow } from '@/components/ui/list';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { membersQuery } from '@/features/churches/api';
import { getErrorMessage } from '@/lib/api';
import { ageFromBirthDate, formatDate, formatDateTime, formatLongDate } from '@/lib/format';
import { applyServerErrors } from '@/lib/forms';
import {
  personAttendanceQuery,
  personQuery,
  useDeletePerson,
  useLinkPersonUser,
  useSavePrivateDetails,
} from './api';

type PrivateInput = z.input<typeof personPrivateDetailsInputSchema>;

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium break-words">{value}</dd>
    </div>
  );
}

function PrivateDetailsDialog({
  churchId,
  personId,
  open,
  onOpenChange,
  details,
}: {
  churchId: string;
  personId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  details: PersonPrivateDetailsInput | null;
}) {
  const save = useSavePrivateDetails(churchId, personId);
  const form = useForm<PrivateInput, unknown, PersonPrivateDetailsInput>({
    resolver: zodResolver(personPrivateDetailsInputSchema),
    defaultValues: {
      nationalId: details?.nationalId ?? '',
      maritalStatus: details?.maritalStatus ?? 'unspecified',
      baptismDate: details?.baptismDate ?? '',
      emergencyContactName: details?.emergencyContactName ?? '',
      emergencyContactPhone: details?.emergencyContactPhone ?? '',
      medicalNotes: details?.medicalNotes ?? '',
      privateNotes: details?.privateNotes ?? '',
    },
  });
  const errors = form.formState.errors;
  const submit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values);
      toast.success('Private details saved');
      onOpenChange(false);
    } catch (error) {
      if (
        !applyServerErrors(error, form.setError, [
          'nationalId',
          'maritalStatus',
          'baptismDate',
          'emergencyContactName',
          'emergencyContactPhone',
          'medicalNotes',
          'privateNotes',
        ])
      ) {
        toast.error(getErrorMessage(error));
      }
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Private details</DialogTitle>
          <DialogDescription>
            Only administrators and this person can see these fields.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="private-details-form"
            onSubmit={(event) => void submit(event)}
            className="flex flex-col gap-4"
            noValidate
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Marital status"
                htmlFor="maritalStatus"
                error={errors.maritalStatus?.message}
              >
                <Select id="maritalStatus" {...form.register('maritalStatus')}>
                  {MARITAL_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {MARITAL_STATUS_LABELS[status]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Baptism date" htmlFor="baptismDate" error={errors.baptismDate?.message}>
                <Input
                  id="baptismDate"
                  type="date"
                  {...form.register('baptismDate')}
                  aria-invalid={!!errors.baptismDate}
                />
              </Field>
            </div>
            <Field label="National ID" htmlFor="nationalId" error={errors.nationalId?.message}>
              <Input id="nationalId" {...form.register('nationalId')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Emergency contact"
                htmlFor="emergencyContactName"
                error={errors.emergencyContactName?.message}
              >
                <Input id="emergencyContactName" {...form.register('emergencyContactName')} />
              </Field>
              <Field
                label="Emergency phone"
                htmlFor="emergencyContactPhone"
                error={errors.emergencyContactPhone?.message}
              >
                <Input
                  id="emergencyContactPhone"
                  type="tel"
                  inputMode="tel"
                  {...form.register('emergencyContactPhone')}
                />
              </Field>
            </div>
            <Field
              label="Medical notes"
              htmlFor="medicalNotes"
              error={errors.medicalNotes?.message}
            >
              <Textarea id="medicalNotes" rows={2} {...form.register('medicalNotes')} />
            </Field>
            <Field
              label="Private notes"
              htmlFor="privateNotes"
              error={errors.privateNotes?.message}
            >
              <Textarea id="privateNotes" rows={3} {...form.register('privateNotes')} />
            </Field>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="private-details-form" loading={form.formState.isSubmitting}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkAccountDialog({
  churchId,
  personId,
  open,
  onOpenChange,
  currentUserId,
}: {
  churchId: string;
  personId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string | null;
}) {
  const members = useQuery({ ...membersQuery(churchId), enabled: open });
  const link = useLinkPersonUser(churchId, personId);
  const [selected, setSelected] = useState(currentUserId ?? '');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link a login account</DialogTitle>
          <DialogDescription>
            Linking lets this person manage their own profile and see their attendance.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {members.isPending ? (
            <PageLoader />
          ) : members.isError ? (
            <Alert variant="error">{getErrorMessage(members.error)}</Alert>
          ) : (
            <Field label="Church account" htmlFor="link-user">
              <Select
                id="link-user"
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
              >
                <option value="">Not linked</option>
                {members.data.items.map((membership) => (
                  <option key={membership.userId} value={membership.userId}>
                    {membership.user.name} · {membership.user.email}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={link.isPending}
            onClick={async () => {
              try {
                await link.mutateAsync({ userId: selected || null });
                toast.success(selected ? 'Account linked' : 'Account unlinked');
                onOpenChange(false);
              } catch (error) {
                toast.error(getErrorMessage(error));
              }
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PersonPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { churchId, base } = useChurch();
  const navigate = useNavigate();
  const query = useQuery(personQuery(churchId, id));
  const remove = useDeletePerson(churchId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [privateOpen, setPrivateOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const attendance = useQuery({
    ...personAttendanceQuery(churchId, id),
    enabled: !!query.data?.canViewPrivate,
    retry: false,
  });

  if (query.isPending) return <PageLoader />;
  if (query.isError) {
    return (
      <Page>
        <PageHeader backTo={`${base}/people`} title="Person" />
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      </Page>
    );
  }

  const {
    person,
    groups,
    linkedUser,
    privateDetails,
    canEdit,
    canDelete,
    canViewPrivate,
    canEditPrivate,
    canLinkUser,
  } = query.data;
  const name = fullName(person);
  const age = ageFromBirthDate(person.birthDate);

  return (
    <Page>
      <PageHeader
        backTo={`${base}/people`}
        title={name}
        description={PERSON_MEMBERSHIP_STATUS_LABELS[person.membershipStatus]}
        actions={
          canEdit ? (
            <Button asChild size="sm" variant="outline">
              <Link to={`${base}/people/${person.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="flex items-center gap-4">
        <EntityAvatar name={name} src={person.photoUrl} size="xl" />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={person.membershipStatus === 'member' ? 'success' : 'secondary'}>
              {PERSON_MEMBERSHIP_STATUS_LABELS[person.membershipStatus]}
            </Badge>
            {linkedUser ? <Badge variant="muted">Has account</Badge> : null}
          </div>
          {person.phone ? (
            <a
              href={`tel:${person.phone}`}
              className="block text-sm text-primary underline-offset-4 hover:underline"
            >
              {person.phone}
            </a>
          ) : null}
          {person.email ? (
            <a
              href={`mailto:${person.email}`}
              className="block truncate text-sm text-primary underline-offset-4 hover:underline"
            >
              {person.email}
            </a>
          ) : null}
        </div>
      </div>

      <Card>
        <CardContent>
          <dl className="divide-y divide-border/60">
            <DetailRow label="Gender" value={GENDER_LABELS[person.gender]} />
            <DetailRow
              label="Birth date"
              value={
                person.birthDate
                  ? `${formatLongDate(person.birthDate)}${age !== null ? ` · ${age} yrs` : ''}`
                  : null
              }
            />
            <DetailRow label="Address" value={person.address} />
            <DetailRow
              label="Joined"
              value={person.joinedAt ? formatDate(person.joinedAt) : null}
            />
            <DetailRow label="Notes" value={person.notes} />
            <DetailRow label="Added" value={formatDate(person.createdAt)} />
          </dl>
        </CardContent>
      </Card>

      <Section title="Groups">
        {groups.length === 0 ? (
          <EmptyState
            title="Not in any group"
            description="Group leaders and administrators can add this person to a group."
          />
        ) : (
          <ListGroup>
            {groups.map((group) => (
              <ListRow key={group.id} to={`${base}/groups/${group.id}`} title={group.name} />
            ))}
          </ListGroup>
        )}
      </Section>

      {canViewPrivate ? (
        <Section
          title="Private details"
          action={
            canEditPrivate ? (
              <Button size="sm" variant="ghost" onClick={() => setPrivateOpen(true)}>
                <Lock /> {privateDetails ? 'Edit' : 'Add'}
              </Button>
            ) : null
          }
        >
          <Card>
            <CardContent>
              {privateDetails ? (
                <dl className="divide-y divide-border/60">
                  <DetailRow
                    label="Marital status"
                    value={MARITAL_STATUS_LABELS[privateDetails.maritalStatus]}
                  />
                  <DetailRow
                    label="Baptism"
                    value={
                      privateDetails.baptismDate ? formatDate(privateDetails.baptismDate) : null
                    }
                  />
                  <DetailRow label="National ID" value={privateDetails.nationalId} />
                  <DetailRow
                    label="Emergency contact"
                    value={privateDetails.emergencyContactName}
                  />
                  <DetailRow label="Emergency phone" value={privateDetails.emergencyContactPhone} />
                  <DetailRow label="Medical notes" value={privateDetails.medicalNotes} />
                  <DetailRow label="Private notes" value={privateDetails.privateNotes} />
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">No private details recorded.</p>
              )}
            </CardContent>
          </Card>
        </Section>
      ) : null}

      {canViewPrivate ? (
        <Section title="Attendance history">
          {attendance.isPending ? (
            <PageLoader />
          ) : attendance.isError ? (
            <Alert variant="info">Attendance history is not available.</Alert>
          ) : attendance.data.items.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="No attendance recorded yet" />
          ) : (
            <ListGroup>
              {attendance.data.items.slice(0, 10).map((item) => (
                <ListRow
                  key={item.sessionId}
                  title={item.title}
                  subtitle={`${formatDateTime(item.sessionAt)}${item.groupName ? ` · ${item.groupName}` : ''}`}
                  trailing={
                    <Badge
                      variant={
                        item.status === 'present'
                          ? 'success'
                          : item.status === 'excused'
                            ? 'warning'
                            : 'destructive'
                      }
                    >
                      {ATTENDANCE_STATUS_LABELS[item.status]}
                    </Badge>
                  }
                />
              ))}
            </ListGroup>
          )}
        </Section>
      ) : null}

      {canLinkUser ? (
        <Section title="Login account">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                {linkedUser ? linkedUser.name : 'No account linked'}
              </CardTitle>
              <CardDescription>
                {linkedUser
                  ? linkedUser.email
                  : 'Link a church account so this person can manage their own profile.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
                {linkedUser ? <Unlink /> : <Link2 />}
                {linkedUser ? 'Change or unlink' : 'Link an account'}
              </Button>
            </CardContent>
          </Card>
        </Section>
      ) : null}

      {canDelete ? (
        <Button variant="outline" className="text-destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 /> Delete person
        </Button>
      ) : null}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${name}?`}
        description="Their group memberships, event participation and attendance records are deleted too."
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(person.id);
            toast.success('Person deleted');
            navigate(`${base}/people`, { replace: true });
          } catch (error) {
            toast.error(getErrorMessage(error));
          }
        }}
      />
      {canEditPrivate ? (
        <PrivateDetailsDialog
          key={privateDetails?.updatedAt ?? 'new'}
          churchId={churchId}
          personId={person.id}
          open={privateOpen}
          onOpenChange={setPrivateOpen}
          details={privateDetails}
        />
      ) : null}
      {canLinkUser ? (
        <LinkAccountDialog
          key={person.userId ?? 'unlinked'}
          churchId={churchId}
          personId={person.id}
          open={linkOpen}
          onOpenChange={setLinkOpen}
          currentUserId={person.userId}
        />
      ) : null}
    </Page>
  );
}
