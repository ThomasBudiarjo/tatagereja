export interface User {
  id: number;
  email: string;
  display_name: string;
  church_name: string;
  timezone: string;
}

export interface Jemaat {
  id: number;
  nama_lengkap: string;
  nama_panggilan: string | null;
  jenis_kelamin: string | null;
  tanggal_lahir: string | null;
  tempat_lahir: string | null;
  alamat: string | null;
  nomor_telepon: string | null;
  email: string | null;
  status_pernikahan: string | null;
  tanggal_baptis: string | null;
  tanggal_sidi: string | null;
  keluarga_id: number | null;
  catatan: string | null;
  created_at: string;
  updated_at: string;
}

export interface JemaatReq {
  nama_lengkap: string;
  nama_panggilan: string;
  jenis_kelamin: string;
  tanggal_lahir: string;
  tempat_lahir: string;
  alamat: string;
  nomor_telepon: string;
  email: string;
  status_pernikahan: string;
  tanggal_baptis: string;
  tanggal_sidi: string;
  keluarga_id: number | null;
  catatan: string;
}

export interface Keluarga {
  id: number;
  nama_keluarga: string;
  alamat: string | null;
  catatan: string | null;
  created_at: string;
  updated_at: string;
}

export interface KeluargaReq {
  nama_keluarga: string;
  alamat: string;
  catatan: string;
}

export interface KeluargaOption {
  id: number;
  nama_keluarga: string;
}

export interface ListResp<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  q: string;
}
