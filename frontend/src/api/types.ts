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

export interface JemaatOption {
  id: number;
  nama_lengkap: string;
}

export interface ServiceType {
  id: number;
  nama: string;
  deskripsi: string | null;
  urutan: number;
  created_at: string;
  updated_at: string;
}

export interface ServiceTypeReq {
  nama: string;
  deskripsi: string;
  urutan: string;
}

export interface Pelayan {
  id: number;
  jemaat_id: number;
  jemaat_nama: string;
  catatan: string | null;
  service_type_ids?: number[];
  service_types: string[];
}

export interface PelayanReq {
  jemaat_id: number;
  catatan: string;
  service_type_ids: number[];
}

export interface Kebaktian {
  id: number;
  nama: string;
  waktu_mulai: string;
  waktu_mulai_local: string;
  waktu_mulai_text: string;
  lokasi: string | null;
  tema: string | null;
  pengkhotbah: string | null;
  catatan: string | null;
  created_at: string;
  updated_at: string;
}

export interface KebaktianReq {
  nama: string;
  waktu_mulai_local: string;
  lokasi: string;
  tema: string;
  pengkhotbah: string;
  catatan: string;
}

export interface JadwalSlot {
  service_type_id: number;
  pelayan_id: number | null;
  catatan: string | null;
}

export interface PelayanForType {
  id: number;
  jemaat_nama: string;
}

export interface JadwalEditor {
  kebaktian: Kebaktian;
  service_types: ServiceType[];
  slots: JadwalSlot[];
  pelayan_options: Record<string, PelayanForType[]>;
}
