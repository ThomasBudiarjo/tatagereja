import {
  GENDERS,
  GENDER_LABELS,
  PERSON_MEMBERSHIP_STATUSES,
  PERSON_MEMBERSHIP_STATUS_LABELS,
  personInputSchema,
  type Person,
  type PersonInput,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, FormActions } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { getErrorMessage } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';

type FormInput = z.input<typeof personInputSchema>;

const FIELDS = [
  'firstName',
  'lastName',
  'gender',
  'birthDate',
  'email',
  'phone',
  'address',
  'photoUrl',
  'membershipStatus',
  'joinedAt',
  'notes',
] as const;

export function PersonForm({
  person,
  canEditAdminFields,
  onSubmit,
  submitLabel,
  onCancel,
}: {
  person?: Person;
  canEditAdminFields: boolean;
  onSubmit: (values: PersonInput) => Promise<unknown>;
  submitLabel: string;
  onCancel?: () => void;
}) {
  const form = useForm<FormInput, unknown, PersonInput>({
    resolver: zodResolver(personInputSchema),
    defaultValues: {
      firstName: person?.firstName ?? '',
      lastName: person?.lastName ?? '',
      gender: person?.gender ?? 'unspecified',
      birthDate: person?.birthDate ?? '',
      email: person?.email ?? '',
      phone: person?.phone ?? '',
      address: person?.address ?? '',
      photoUrl: person?.photoUrl ?? '',
      membershipStatus: person?.membershipStatus ?? 'visitor',
      joinedAt: person?.joinedAt ?? '',
      notes: person?.notes ?? '',
    },
  });
  const errors = form.formState.errors;

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values);
    } catch (error) {
      if (!applyServerErrors(error, form.setError, FIELDS)) {
        form.setError('root', { message: getErrorMessage(error) });
      }
    }
  });

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
      {errors.root ? <Alert variant="error">{errors.root.message}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName" error={errors.firstName?.message} required>
          <Input
            id="firstName"
            autoComplete="given-name"
            {...form.register('firstName')}
            aria-invalid={!!errors.firstName}
          />
        </Field>
        <Field label="Last name" htmlFor="lastName" error={errors.lastName?.message}>
          <Input id="lastName" autoComplete="family-name" {...form.register('lastName')} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Gender" htmlFor="gender" error={errors.gender?.message}>
          <Select id="gender" {...form.register('gender')}>
            {GENDERS.map((gender) => (
              <option key={gender} value={gender}>
                {GENDER_LABELS[gender]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Birth date" htmlFor="birthDate" error={errors.birthDate?.message}>
          <Input
            id="birthDate"
            type="date"
            {...form.register('birthDate')}
            aria-invalid={!!errors.birthDate}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" htmlFor="person-email" error={errors.email?.message}>
          <Input
            id="person-email"
            type="email"
            inputMode="email"
            {...form.register('email')}
            aria-invalid={!!errors.email}
          />
        </Field>
        <Field label="Phone" htmlFor="person-phone" error={errors.phone?.message}>
          <Input id="person-phone" type="tel" inputMode="tel" {...form.register('phone')} />
        </Field>
      </div>
      <Field label="Address" htmlFor="person-address" error={errors.address?.message}>
        <Input id="person-address" {...form.register('address')} />
      </Field>
      <Field
        label="Photo URL"
        htmlFor="photoUrl"
        error={errors.photoUrl?.message}
        description="Link to a photo, e.g. https://example.com/photo.jpg"
      >
        <Input
          id="photoUrl"
          type="url"
          inputMode="url"
          placeholder="https://"
          {...form.register('photoUrl')}
          aria-invalid={!!errors.photoUrl}
        />
      </Field>
      {canEditAdminFields ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Membership status"
            htmlFor="membershipStatus"
            error={errors.membershipStatus?.message}
          >
            <Select id="membershipStatus" {...form.register('membershipStatus')}>
              {PERSON_MEMBERSHIP_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PERSON_MEMBERSHIP_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Joined on" htmlFor="joinedAt" error={errors.joinedAt?.message}>
            <Input
              id="joinedAt"
              type="date"
              {...form.register('joinedAt')}
              aria-invalid={!!errors.joinedAt}
            />
          </Field>
        </div>
      ) : null}
      <Field
        label="Notes"
        htmlFor="notes"
        error={errors.notes?.message}
        description="Visible to everyone who can see this profile."
      >
        <Textarea id="notes" rows={3} {...form.register('notes')} />
      </Field>
      <FormActions>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={form.formState.isSubmitting}>
          {submitLabel}
        </Button>
      </FormActions>
    </form>
  );
}
