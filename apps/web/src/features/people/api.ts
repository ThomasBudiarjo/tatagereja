import {
  linkPersonUserBodySchema,
  myAttendanceSchema,
  okSchema,
  personDetailSchema,
  personInputSchema,
  personListSchema,
  personPrivateDetailsInputSchema,
  personPrivateDetailsResponseSchema,
  personResponseSchema,
  type PersonListQuery,
} from '@tatagereja/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { request } from '@/lib/api';
import { keys } from '@/lib/keys';

/** Deleting or relinking a person also affects groups, events and attendance. */
const churchInvalidate = (churchId: string) => ['church', churchId] as const;

export type PeopleListParams = Partial<
  Pick<PersonListQuery, 'q' | 'page' | 'limit' | 'status' | 'groupId'>
>;

export const peopleListQuery = (churchId: string, params: PeopleListParams = {}) =>
  queryOptions({
    queryKey: keys.peopleList(churchId, params),
    queryFn: () => request(personListSchema, { url: `/churches/${churchId}/people`, params }),
  });

export const personQuery = (churchId: string, personId: string) =>
  queryOptions({
    queryKey: keys.person(churchId, personId),
    queryFn: () => request(personDetailSchema, { url: `/churches/${churchId}/people/${personId}` }),
  });

export const personAttendanceQuery = (churchId: string, personId: string) =>
  queryOptions({
    queryKey: keys.personAttendance(churchId, personId),
    queryFn: () =>
      request(myAttendanceSchema, { url: `/churches/${churchId}/people/${personId}/attendance` }),
  });

export function useCreatePerson(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof personInputSchema>) =>
      request(personResponseSchema, {
        method: 'POST',
        url: `/churches/${churchId}/people`,
        data: personInputSchema.parse(body),
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.people(churchId) }),
  });
}

export function useUpdatePerson(churchId: string, personId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof personInputSchema>) =>
      request(personResponseSchema, {
        method: 'PATCH',
        url: `/churches/${churchId}/people/${personId}`,
        data: personInputSchema.parse(body),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.people(churchId) });
      void client.invalidateQueries({ queryKey: keys.groups(churchId) });
    },
  });
}

export function useDeletePerson(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (personId: string) =>
      request(okSchema, { method: 'DELETE', url: `/churches/${churchId}/people/${personId}` }),
    onSuccess: () => void client.invalidateQueries({ queryKey: churchInvalidate(churchId) }),
  });
}

export function useSavePrivateDetails(churchId: string, personId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof personPrivateDetailsInputSchema>) =>
      request(personPrivateDetailsResponseSchema, {
        method: 'PUT',
        url: `/churches/${churchId}/people/${personId}/private`,
        data: personPrivateDetailsInputSchema.parse(body),
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.person(churchId, personId) }),
  });
}

export function useLinkPersonUser(churchId: string, personId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof linkPersonUserBodySchema>) =>
      request(personResponseSchema, {
        method: 'PUT',
        url: `/churches/${churchId}/people/${personId}/user`,
        data: linkPersonUserBodySchema.parse(body),
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: churchInvalidate(churchId) }),
  });
}
