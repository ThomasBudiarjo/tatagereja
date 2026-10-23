import {
  assetCategoryListSchema,
  assetLoanListSchema,
  assetLoanResponseSchema,
  assetMaintenanceInputSchema,
  assetMaintenanceResponseSchema,
  bookingAvailabilityBodySchema,
  bookingAvailabilitySchema,
  cancelBookingBodySchema,
  checkOutAssetBodySchema,
  decideBookingBodySchema,
  facilitiesOverviewSchema,
  facilitiesPeopleSchema,
  facilityBookingDetailSchema,
  facilityBookingInputSchema,
  facilityBookingListSchema,
  facilityBookingResponseSchema,
  facilityResourceInputSchema,
  facilityResourceListSchema,
  facilityResourceResponseSchema,
  facilityScheduleSchema,
  groupListSchema,
  inventoryAssetDetailSchema,
  inventoryAssetInputSchema,
  inventoryAssetListSchema,
  inventoryAssetResponseSchema,
  okSchema,
  returnAssetBodySchema,
  type AssetLoanListQuery,
  type FacilityBookingDetail,
  type FacilityBookingListQuery,
  type FacilityResourceListQuery,
  type InventoryAssetDetail,
  type InventoryAssetListQuery,
} from '@tatagereja/shared';
import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { z } from 'zod';
import { request } from '@/lib/api';
import { churchScope, keys } from '@/lib/keys';
import { optimistic } from '@/lib/use-mutation-toast';

/** Query keys of the facilities module, all below `['church', id, 'facilities']`. */
export const facilitiesKeys = {
  all: (churchId: string) => [...churchScope(churchId), 'facilities'] as const,
  overview: (churchId: string) => [...facilitiesKeys.all(churchId), 'overview'] as const,
  resources: (churchId: string) => [...facilitiesKeys.all(churchId), 'resources'] as const,
  resourceList: (churchId: string, params: Record<string, unknown>) =>
    [...facilitiesKeys.resources(churchId), 'list', params] as const,
  resource: (churchId: string, id: string) =>
    [...facilitiesKeys.resources(churchId), 'detail', id] as const,
  schedule: (churchId: string, params: Record<string, unknown>) =>
    [...facilitiesKeys.all(churchId), 'schedule', params] as const,
  bookings: (churchId: string) => [...facilitiesKeys.all(churchId), 'bookings'] as const,
  bookingList: (churchId: string, params: Record<string, unknown>) =>
    [...facilitiesKeys.bookings(churchId), 'list', params] as const,
  booking: (churchId: string, id: string) =>
    [...facilitiesKeys.bookings(churchId), 'detail', id] as const,
  pendingBadge: (churchId: string) => [...facilitiesKeys.bookings(churchId), 'badge'] as const,
  availability: (churchId: string, params: Record<string, unknown>) =>
    [...facilitiesKeys.all(churchId), 'availability', params] as const,
  assets: (churchId: string) => [...facilitiesKeys.all(churchId), 'assets'] as const,
  assetList: (churchId: string, params: Record<string, unknown>) =>
    [...facilitiesKeys.assets(churchId), 'list', params] as const,
  asset: (churchId: string, id: string) =>
    [...facilitiesKeys.assets(churchId), 'detail', id] as const,
  categories: (churchId: string) => [...facilitiesKeys.assets(churchId), 'categories'] as const,
  loans: (churchId: string, params: Record<string, unknown>) =>
    [...facilitiesKeys.assets(churchId), 'loans', params] as const,
  people: (churchId: string, params: Record<string, unknown>) =>
    [...facilitiesKeys.all(churchId), 'people', params] as const,
  groups: (churchId: string) => [...facilitiesKeys.all(churchId), 'groups'] as const,
};

/**
 * Facilities data is closely linked (a booking moves the overview, the schedule, the room's
 * "available now" and the pending badge; a loan moves the asset, the lists and the overdue
 * count), so writes refresh the whole module, the home dashboard and the notification inbox
 * (requesters, managers and borrowers are notified). Only mounted queries refetch.
 */
export const invalidateFacilities = (client: QueryClient, churchId: string) =>
  Promise.all([
    client.invalidateQueries({ queryKey: facilitiesKeys.all(churchId) }),
    client.invalidateQueries({ queryKey: keys.dashboard(churchId) }),
    client.invalidateQueries({
      predicate: (query) => query.queryKey.some((part) => part === 'notifications'),
    }),
  ]);

const at = (churchId: string, path = '') => `/churches/${churchId}/facilities${path}`;
const inv = (churchId: string, path = '') => `/churches/${churchId}/inventory${path}`;

// ---------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------

export const overviewQuery = (churchId: string) =>
  queryOptions({
    queryKey: facilitiesKeys.overview(churchId),
    queryFn: () => request(facilitiesOverviewSchema, { url: at(churchId, '/overview') }),
    refetchInterval: 5 * 60_000,
  });

export type ResourceListParams = Partial<FacilityResourceListQuery>;

export const resourcesQuery = (churchId: string, params: ResourceListParams = {}) =>
  queryOptions({
    queryKey: facilitiesKeys.resourceList(churchId, params),
    queryFn: () =>
      request(facilityResourceListSchema, {
        url: at(churchId, '/resources'),
        params: { ...params, includeInactive: params.includeInactive ? 'true' : undefined },
      }),
    placeholderData: keepPreviousData,
  });

export const resourceQuery = (churchId: string, id: string) =>
  queryOptions({
    queryKey: facilitiesKeys.resource(churchId, id),
    queryFn: () =>
      request(facilityResourceResponseSchema, { url: at(churchId, `/resources/${id}`) }),
  });

export type ScheduleParams = { from: string; to: string; resourceId?: string };

export const scheduleQuery = (churchId: string, params: ScheduleParams) =>
  queryOptions({
    queryKey: facilitiesKeys.schedule(churchId, params),
    queryFn: () => request(facilityScheduleSchema, { url: at(churchId, '/schedule'), params }),
    placeholderData: keepPreviousData,
  });

export type BookingListParams = Partial<Omit<FacilityBookingListQuery, 'mine'>> & {
  mine?: boolean;
};

export const bookingsQuery = (churchId: string, params: BookingListParams = {}) =>
  queryOptions({
    queryKey: facilitiesKeys.bookingList(churchId, params),
    queryFn: () =>
      request(facilityBookingListSchema, {
        url: at(churchId, '/bookings'),
        params: { ...params, mine: params.mine ? 'true' : undefined },
      }),
    placeholderData: keepPreviousData,
  });

export const bookingQuery = (churchId: string, id: string) =>
  queryOptions({
    queryKey: facilitiesKeys.booking(churchId, id),
    queryFn: () => request(facilityBookingDetailSchema, { url: at(churchId, `/bookings/${id}`) }),
  });

/** Requests waiting for a decision, for the menu badge of managers. */
export const pendingBadgeQuery = (churchId: string) => ({
  queryKey: facilitiesKeys.pendingBadge(churchId),
  queryFn: async () =>
    (
      await request(facilityBookingListSchema, {
        url: at(churchId, '/bookings'),
        params: { status: 'pending', limit: 1 },
      })
    ).total,
  staleTime: 60_000,
});

export type AvailabilityParams = z.input<typeof bookingAvailabilityBodySchema>;

/** The live availability check of the booking form; it books nothing. */
export const availabilityQuery = (churchId: string, params: AvailabilityParams) =>
  queryOptions({
    queryKey: facilitiesKeys.availability(churchId, params),
    queryFn: () =>
      request(bookingAvailabilitySchema, {
        method: 'POST',
        url: at(churchId, '/bookings/check'),
        data: bookingAvailabilityBodySchema.parse(params),
      }),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

export type AssetListParams = Partial<InventoryAssetListQuery>;

export const assetsQuery = (churchId: string, params: AssetListParams = {}) =>
  queryOptions({
    queryKey: facilitiesKeys.assetList(churchId, params),
    queryFn: () => request(inventoryAssetListSchema, { url: inv(churchId, '/assets'), params }),
    placeholderData: keepPreviousData,
  });

export const assetQuery = (churchId: string, id: string) =>
  queryOptions({
    queryKey: facilitiesKeys.asset(churchId, id),
    queryFn: () => request(inventoryAssetDetailSchema, { url: inv(churchId, `/assets/${id}`) }),
  });

export const categoriesQuery = (churchId: string) =>
  queryOptions({
    queryKey: facilitiesKeys.categories(churchId),
    queryFn: () => request(assetCategoryListSchema, { url: inv(churchId, '/assets/categories') }),
    staleTime: 5 * 60_000,
  });

export type LoanListParams = Partial<AssetLoanListQuery>;

export const loansQuery = (churchId: string, params: LoanListParams = {}) =>
  queryOptions({
    queryKey: facilitiesKeys.loans(churchId, params),
    queryFn: () => request(assetLoanListSchema, { url: inv(churchId, '/loans'), params }),
    placeholderData: keepPreviousData,
  });

export const peopleQuery = (churchId: string, params: { q?: string; ids?: string[] }) =>
  queryOptions({
    queryKey: facilitiesKeys.people(churchId, params),
    queryFn: () =>
      request(facilitiesPeopleSchema, {
        url: at(churchId, '/people'),
        params: { q: params.q || undefined, ids: params.ids?.join(',') || undefined },
      }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

/** Groups and komisi a booking can be made for (needs `groups.view`). */
export const groupOptionsQuery = (churchId: string) =>
  queryOptions({
    queryKey: facilitiesKeys.groups(churchId),
    queryFn: () => request(groupListSchema, { url: `/churches/${churchId}/groups` }),
    staleTime: 5 * 60_000,
  });

// ---------------------------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------------------------

/** A mutation that refreshes the facilities module when it succeeds. */
function useFacilitiesMutation<TVariables, TData>(
  churchId: string,
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => invalidateFacilities(client, churchId),
  });
}

export const useSaveResource = (churchId: string, id?: string) =>
  useFacilitiesMutation(churchId, (body: z.input<typeof facilityResourceInputSchema>) =>
    request(facilityResourceResponseSchema, {
      method: id ? 'PATCH' : 'POST',
      url: at(churchId, id ? `/resources/${id}` : '/resources'),
      data: facilityResourceInputSchema.parse(body),
    }),
  );

export function useDeleteResource(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(okSchema, { method: 'DELETE', url: at(churchId, `/resources/${id}`) }),
    onSuccess: (_data, id) => {
      client.removeQueries({ queryKey: facilitiesKeys.resource(churchId, id) });
      return invalidateFacilities(client, churchId);
    },
  });
}

export const useSaveBooking = (churchId: string, id?: string) =>
  useFacilitiesMutation(churchId, (body: z.input<typeof facilityBookingInputSchema>) =>
    request(facilityBookingResponseSchema, {
      method: id ? 'PATCH' : 'POST',
      url: at(churchId, id ? `/bookings/${id}` : '/bookings'),
      data: facilityBookingInputSchema.parse(body),
    }),
  );

/**
 * Approving or rejecting shows at once on the booking page; the server answer replaces it, and
 * a failure (for instance a new conflict) puts the old status back.
 */
export function useDecideBooking(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: z.input<typeof decideBookingBodySchema> & { id: string }) =>
      request(facilityBookingResponseSchema, {
        method: 'POST',
        url: at(churchId, `/bookings/${id}/decision`),
        data: decideBookingBodySchema.parse(body),
      }),
    onMutate: async ({ id, decision }) => {
      const rollback = await optimistic<FacilityBookingDetail>(
        client,
        facilitiesKeys.booking(churchId, id),
        (old) => old && { ...old, booking: { ...old.booking, status: decision } },
      );
      return { rollback };
    },
    onError: (_error, _variables, context) => context?.rollback(),
    onSettled: () => invalidateFacilities(client, churchId),
  });
}

export const useCancelBooking = (churchId: string) =>
  useFacilitiesMutation(
    churchId,
    ({ id, ...body }: z.input<typeof cancelBookingBodySchema> & { id: string }) =>
      request(facilityBookingResponseSchema, {
        method: 'POST',
        url: at(churchId, `/bookings/${id}/cancel`),
        data: cancelBookingBodySchema.parse(body),
      }),
  );

export const useSaveAsset = (churchId: string, id?: string) =>
  useFacilitiesMutation(churchId, (body: z.input<typeof inventoryAssetInputSchema>) =>
    request(inventoryAssetResponseSchema, {
      method: id ? 'PATCH' : 'POST',
      url: inv(churchId, id ? `/assets/${id}` : '/assets'),
      data: inventoryAssetInputSchema.parse(body),
    }),
  );

export function useDeleteAsset(churchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(okSchema, { method: 'DELETE', url: inv(churchId, `/assets/${id}`) }),
    onSuccess: (_data, id) => {
      client.removeQueries({ queryKey: facilitiesKeys.asset(churchId, id) });
      return invalidateFacilities(client, churchId);
    },
  });
}

/** Checking out flips the asset to "on loan" at once; a failure puts it back. */
export function useCheckOutAsset(churchId: string, assetId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof checkOutAssetBodySchema>) =>
      request(assetLoanResponseSchema, {
        method: 'POST',
        url: inv(churchId, `/assets/${assetId}/loans`),
        data: checkOutAssetBodySchema.parse(body),
      }),
    onMutate: async () => {
      const rollback = await optimistic<InventoryAssetDetail>(
        client,
        facilitiesKeys.asset(churchId, assetId),
        (old) => old && { ...old, asset: { ...old.asset, status: 'on_loan' } },
      );
      return { rollback };
    },
    onError: (_error, _variables, context) => context?.rollback(),
    onSettled: () => invalidateFacilities(client, churchId),
  });
}

export const useReturnAsset = (churchId: string) =>
  useFacilitiesMutation(
    churchId,
    ({ loanId, ...body }: z.input<typeof returnAssetBodySchema> & { loanId: string }) =>
      request(assetLoanResponseSchema, {
        method: 'POST',
        url: inv(churchId, `/loans/${loanId}/return`),
        data: returnAssetBodySchema.parse(body),
      }),
  );

export const useLogMaintenance = (churchId: string, assetId: string) =>
  useFacilitiesMutation(churchId, (body: z.input<typeof assetMaintenanceInputSchema>) =>
    request(assetMaintenanceResponseSchema, {
      method: 'POST',
      url: inv(churchId, `/assets/${assetId}/maintenance`),
      data: assetMaintenanceInputSchema.parse(body),
    }),
  );

export const useDeleteMaintenance = (churchId: string) =>
  useFacilitiesMutation(churchId, (id: string) =>
    request(okSchema, { method: 'DELETE', url: inv(churchId, `/maintenance/${id}`) }),
  );
