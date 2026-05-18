export function emptyToNull(v: string): string | null {
  const t = v.trim();
  return t === '' ? null : t;
}

export function maritalStatusLabel(s: string | null): string {
  switch (s) {
    case 'belum_menikah':
      return 'Belum Menikah';
    case 'menikah':
      return 'Menikah';
    case 'cerai':
      return 'Cerai';
    case 'duda':
      return 'Duda';
    case 'janda':
      return 'Janda';
    default:
      return '-';
  }
}

export function genderLabel(s: string | null): string {
  if (s === 'L') return 'Laki-laki';
  if (s === 'P') return 'Perempuan';
  return '-';
}
