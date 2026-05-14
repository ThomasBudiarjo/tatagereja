// Minimal i18n helper. Wraps user-visible strings so they can be
// extracted/localized later without touching every component.
//
// Usage: t('jemaat.title', 'Daftar Jemaat')
// The second argument is the Indonesian fallback used today; the first
// is a stable key for future translation tables.
export function t(_key: string, fallback: string): string {
  return fallback;
}

const dateFmt = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return dateFmt.format(d);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const safe = iso.includes('T') ? iso : iso.replace(' ', 'T');
  const d = new Date(safe);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('id-ID');
}
