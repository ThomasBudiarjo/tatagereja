export type User = {
  id: number;
  email: string;
  display_name: string;
  church_name: string;
  timezone: string;
};

export type Keluarga = {
  id: number;
  user_id: number;
  nama_keluarga: string;
  alamat: string | null;
  catatan: string | null;
  created_at: string;
  updated_at: string;
};

export type Jemaat = {
  id: number;
  user_id: number;
  nama_lengkap: string;
  nama_panggilan: string | null;
  jenis_kelamin: 'L' | 'P' | null;
  tanggal_lahir: string | null;
  tempat_lahir: string | null;
  alamat: string | null;
  nomor_telepon: string | null;
  email: string | null;
  status_pernikahan: 'belum_menikah' | 'menikah' | 'cerai' | 'duda' | 'janda' | null;
  tanggal_baptis: string | null;
  tanggal_sidi: string | null;
  keluarga_id: number | null;
  catatan: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type ServiceType = {
  id: number;
  user_id: number;
  nama: string;
  deskripsi: string | null;
  urutan: number;
  created_at: string;
  updated_at: string;
};

export type Pelayan = {
  id: number;
  user_id: number;
  jemaat_id: number;
  nama_lengkap: string;
  nama_panggilan: string | null;
  catatan: string | null;
  service_type_ids: number[];
};

export type Kebaktian = {
  id: number;
  user_id: number;
  nama: string;
  waktu_mulai: string;
  lokasi: string | null;
  tema: string | null;
  pengkhotbah: string | null;
  catatan: string | null;
  created_at: string;
  updated_at: string;
};

export type JadwalSlot = {
  id: number;
  user_id: number;
  kebaktian_id: number;
  service_type_id: number;
  service_type_nama: string;
  service_type_urutan: number;
  pelayan_id: number | null;
  pelayan_id_real: number | null;
  jemaat_id: number | null;
  pelayan_nama_lengkap: string | null;
  pelayan_nama_panggilan: string | null;
  catatan: string | null;
  confirmed: number;
};

export type Paginated<T> = {
  data: T[];
  total: number;
  limit: number;
  offset: number;
};

export type ListWrap<T> = {
  data: T[];
};
