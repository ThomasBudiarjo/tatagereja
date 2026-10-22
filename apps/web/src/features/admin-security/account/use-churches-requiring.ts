import { useQuery } from '@tanstack/react-query';
import { myChurchesQuery } from '@/features/churches/api';

/** Names of the churches whose policy asks this account for two-step verification. */
export function useChurchesRequiring(churchIds: readonly string[]): string[] {
  const churches = useQuery({ ...myChurchesQuery(), enabled: churchIds.length > 0 });
  return churchIds.map(
    (id) => churches.data?.items.find((item) => item.church.id === id)?.church.name ?? '…',
  );
}
