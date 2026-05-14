export type Role = 'admin' | 'editor' | 'viewer';

export interface User {
  id: number;
  email: string;
  display_name: string;
  role: Role;
  church_id: number;
}

export type JenisKelamin = 'L' | 'P';
export type StatusPernikahan =
  | 'belum_menikah'
  | 'menikah'
  | 'cerai'
  | 'duda'
  | 'janda';

export interface Jemaat {
  id: number;
  church_id: number;
  nama_lengkap: string;
  nama_panggilan: string | null;
  jenis_kelamin: JenisKelamin | null;
  tanggal_lahir: string | null;
  tempat_lahir: string | null;
  alamat: string | null;
  nomor_telepon: string | null;
  email: string | null;
  status_pernikahan: StatusPernikahan | null;
  tanggal_baptis: string | null;
  tanggal_sidi: string | null;
  keluarga_id: number | null;
  catatan: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateJemaatInput {
  nama_lengkap: string;
  nama_panggilan?: string | null;
  jenis_kelamin?: JenisKelamin | null;
  tanggal_lahir?: string | null;
  tempat_lahir?: string | null;
  alamat?: string | null;
  nomor_telepon?: string | null;
  email?: string | null;
  status_pernikahan?: StatusPernikahan | null;
  tanggal_baptis?: string | null;
  tanggal_sidi?: string | null;
  keluarga_id?: number | null;
  catatan?: string | null;
}

export interface ServiceType {
  id: number;
  church_id: number;
  nama: string;
  deskripsi: string | null;
  warna: string | null;
  urutan: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateServiceTypeInput {
  nama: string;
  deskripsi?: string | null;
  warna?: string | null;
  urutan: number;
}

export interface PelayanServiceTypeRef {
  id: number;
  nama: string;
  warna: string | null;
  skill_level: string | null;
}

export interface Pelayan {
  id: number;
  church_id: number;
  jemaat_id: number;
  nama_lengkap: string;
  nama_panggilan: string | null;
  catatan: string | null;
  is_active: boolean;
  service_types: PelayanServiceTypeRef[];
  created_at: string;
  updated_at: string;
}

export interface CreatePelayanInput {
  jemaat_id: number;
  catatan?: string | null;
  service_type_ids: number[];
}

export interface UpdatePelayanInput {
  catatan?: string | null;
  is_active?: boolean;
  service_type_ids: number[];
}

export interface Kebaktian {
  id: number;
  church_id: number;
  nama: string;
  tanggal: string;
  waktu_mulai: string;
  lokasi: string | null;
  tema: string | null;
  pengkhotbah: string | null;
  catatan: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateKebaktianInput {
  nama: string;
  tanggal: string;
  waktu_mulai: string;
  lokasi?: string | null;
  tema?: string | null;
  pengkhotbah?: string | null;
  catatan?: string | null;
}

export interface JadwalSlot {
  id: number;
  kebaktian_id: number;
  service_type_id: number;
  service_type_name: string;
  service_type_warna: string | null;
  pelayan_id: number | null;
  pelayan_jemaat_id: number | null;
  pelayan_nama: string | null;
  catatan: string | null;
  status: string;
}

export interface JadwalSlotInput {
  service_type_id: number;
  pelayan_id: number | null;
  catatan?: string | null;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface KebaktianList extends Paginated<Kebaktian> {
  from: string;
  to: string;
}
