export const offsetOf = (query: { page: number; limit: number }): number =>
  (query.page - 1) * query.limit;

export const likePattern = (q: string): string => `%${q.trim()}%`;
