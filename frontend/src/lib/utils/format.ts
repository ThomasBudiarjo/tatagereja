export function emptyToNull(v: string): string | null {
  const t = v.trim();
  return t === '' ? null : t;
}

export function maritalStatusLabel(s: string | null): string {
  switch (s) {
    case 'belum_menikah':
      return 'Belum menikah';
    case 'menikah':
      return 'Menikah';
    case 'cerai':
      return 'Cerai';
    case 'duda':
      return 'Duda';
    case 'janda':
      return 'Janda';
    default:
      return '—';
  }
}

export function genderLabel(s: string | null): string {
  if (s === 'L') return 'Laki-laki';
  if (s === 'P') return 'Perempuan';
  return '—';
}

const MONTH_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** Format an ISO date (YYYY-MM-DD) as "12 Mei 1990". Returns "—" when blank. */
export function formatDateID(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${parseInt(d, 10)} ${MONTH_ID[parseInt(mo, 10) - 1]} ${y}`;
}

/** Compute age in whole years from an ISO date string. */
export function ageFromIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const [, y, mo, d] = m;
  const birth = new Date(Number(y), Number(mo) - 1, Number(d));
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const md = now.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

/** Greeting key by current Asia/Jakarta hour. */
export function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 18) return 'Selamat sore';
  return 'Selamat malam';
}
