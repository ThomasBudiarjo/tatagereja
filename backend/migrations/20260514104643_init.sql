-- Create "churches" table
CREATE TABLE `churches` (
  `id` integer NULL PRIMARY KEY AUTOINCREMENT,
  `name` text NOT NULL,
  `slug` text NOT NULL,
  `timezone` text NOT NULL DEFAULT 'Asia/Jakarta',
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  `updated_at` text NOT NULL DEFAULT (datetime('now'))
);
-- Create index "churches_slug" to table: "churches"
CREATE UNIQUE INDEX `churches_slug` ON `churches` (`slug`);
-- Create "users" table
CREATE TABLE `users` (
  `id` integer NULL PRIMARY KEY AUTOINCREMENT,
  `church_id` integer NOT NULL,
  `email` text NOT NULL,
  `password_hash` text NOT NULL,
  `display_name` text NOT NULL,
  `role` text NOT NULL DEFAULT 'admin',
  `is_active` integer NOT NULL DEFAULT 1,
  `last_login_at` text NULL,
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  `updated_at` text NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT `0` FOREIGN KEY (`church_id`) REFERENCES `churches` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CHECK (role IN ('admin', 'editor', 'viewer'))
);
-- Create index "users_email" to table: "users"
CREATE UNIQUE INDEX `users_email` ON `users` (`email`);
-- Create index "idx_users_church_id" to table: "users"
CREATE INDEX `idx_users_church_id` ON `users` (`church_id`);
-- Create index "idx_users_email" to table: "users"
CREATE INDEX `idx_users_email` ON `users` (`email`);
-- Create "jemaat" table
CREATE TABLE `jemaat` (
  `id` integer NULL PRIMARY KEY AUTOINCREMENT,
  `church_id` integer NOT NULL,
  `nama_lengkap` text NOT NULL,
  `nama_panggilan` text NULL,
  `jenis_kelamin` text NULL,
  `tanggal_lahir` text NULL,
  `tempat_lahir` text NULL,
  `alamat` text NULL,
  `nomor_telepon` text NULL,
  `email` text NULL,
  `status_pernikahan` text NULL,
  `tanggal_baptis` text NULL,
  `tanggal_sidi` text NULL,
  `keluarga_id` integer NULL,
  `catatan` text NULL,
  `is_active` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  `updated_at` text NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT `0` FOREIGN KEY (`keluarga_id`) REFERENCES `keluarga` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT `1` FOREIGN KEY (`church_id`) REFERENCES `churches` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CHECK (jenis_kelamin IN ('L', 'P') OR jenis_kelamin IS NULL),
  CHECK (
                          status_pernikahan IN ('belum_menikah', 'menikah', 'cerai', 'duda', 'janda')
                          OR status_pernikahan IS NULL
                        )
);
-- Create index "idx_jemaat_church_id" to table: "jemaat"
CREATE INDEX `idx_jemaat_church_id` ON `jemaat` (`church_id`);
-- Create index "idx_jemaat_nama" to table: "jemaat"
CREATE INDEX `idx_jemaat_nama` ON `jemaat` (`church_id`, `nama_lengkap`);
-- Create index "idx_jemaat_keluarga_id" to table: "jemaat"
CREATE INDEX `idx_jemaat_keluarga_id` ON `jemaat` (`keluarga_id`);
-- Create "keluarga" table
CREATE TABLE `keluarga` (
  `id` integer NULL PRIMARY KEY AUTOINCREMENT,
  `church_id` integer NOT NULL,
  `nama_keluarga` text NOT NULL,
  `alamat` text NULL,
  `catatan` text NULL,
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  `updated_at` text NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT `0` FOREIGN KEY (`church_id`) REFERENCES `churches` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_keluarga_church_id" to table: "keluarga"
CREATE INDEX `idx_keluarga_church_id` ON `keluarga` (`church_id`);
-- Create "service_types" table
CREATE TABLE `service_types` (
  `id` integer NULL PRIMARY KEY AUTOINCREMENT,
  `church_id` integer NOT NULL,
  `nama` text NOT NULL,
  `deskripsi` text NULL,
  `warna` text NULL,
  `urutan` integer NOT NULL DEFAULT 0,
  `is_active` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  `updated_at` text NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT `0` FOREIGN KEY (`church_id`) REFERENCES `churches` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "service_types_church_id_nama" to table: "service_types"
CREATE UNIQUE INDEX `service_types_church_id_nama` ON `service_types` (`church_id`, `nama`);
-- Create index "idx_service_types_church_id" to table: "service_types"
CREATE INDEX `idx_service_types_church_id` ON `service_types` (`church_id`);
-- Create "pelayan" table
CREATE TABLE `pelayan` (
  `id` integer NULL PRIMARY KEY AUTOINCREMENT,
  `church_id` integer NOT NULL,
  `jemaat_id` integer NOT NULL,
  `catatan` text NULL,
  `is_active` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  `updated_at` text NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT `0` FOREIGN KEY (`jemaat_id`) REFERENCES `jemaat` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`church_id`) REFERENCES `churches` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "pelayan_church_id_jemaat_id" to table: "pelayan"
CREATE UNIQUE INDEX `pelayan_church_id_jemaat_id` ON `pelayan` (`church_id`, `jemaat_id`);
-- Create index "idx_pelayan_church_id" to table: "pelayan"
CREATE INDEX `idx_pelayan_church_id` ON `pelayan` (`church_id`);
-- Create index "idx_pelayan_jemaat_id" to table: "pelayan"
CREATE INDEX `idx_pelayan_jemaat_id` ON `pelayan` (`jemaat_id`);
-- Create "pelayan_service_types" table
CREATE TABLE `pelayan_service_types` (
  `pelayan_id` integer NOT NULL,
  `service_type_id` integer NOT NULL,
  `skill_level` text NULL,
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (`pelayan_id`, `service_type_id`),
  CONSTRAINT `0` FOREIGN KEY (`service_type_id`) REFERENCES `service_types` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`pelayan_id`) REFERENCES `pelayan` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CHECK (skill_level IN ('beginner', 'intermediate', 'advanced') OR skill_level IS NULL)
);
-- Create index "idx_pelayan_st_service_type_id" to table: "pelayan_service_types"
CREATE INDEX `idx_pelayan_st_service_type_id` ON `pelayan_service_types` (`service_type_id`);
-- Create "kebaktian" table
CREATE TABLE `kebaktian` (
  `id` integer NULL PRIMARY KEY AUTOINCREMENT,
  `church_id` integer NOT NULL,
  `nama` text NOT NULL,
  `tanggal` text NOT NULL,
  `waktu_mulai` text NOT NULL,
  `lokasi` text NULL,
  `tema` text NULL,
  `pengkhotbah` text NULL,
  `catatan` text NULL,
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  `updated_at` text NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT `0` FOREIGN KEY (`church_id`) REFERENCES `churches` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_kebaktian_church_id" to table: "kebaktian"
CREATE INDEX `idx_kebaktian_church_id` ON `kebaktian` (`church_id`);
-- Create index "idx_kebaktian_tanggal" to table: "kebaktian"
CREATE INDEX `idx_kebaktian_tanggal` ON `kebaktian` (`church_id`, `tanggal`);
-- Create "jadwal_pelayanan" table
CREATE TABLE `jadwal_pelayanan` (
  `id` integer NULL PRIMARY KEY AUTOINCREMENT,
  `church_id` integer NOT NULL,
  `kebaktian_id` integer NOT NULL,
  `service_type_id` integer NOT NULL,
  `pelayan_id` integer NULL,
  `catatan` text NULL,
  `status` text NOT NULL DEFAULT 'scheduled',
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  `updated_at` text NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT `0` FOREIGN KEY (`pelayan_id`) REFERENCES `pelayan` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT `1` FOREIGN KEY (`service_type_id`) REFERENCES `service_types` (`id`) ON UPDATE NO ACTION ON DELETE RESTRICT,
  CONSTRAINT `2` FOREIGN KEY (`kebaktian_id`) REFERENCES `kebaktian` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `3` FOREIGN KEY (`church_id`) REFERENCES `churches` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CHECK (status IN ('scheduled', 'confirmed', 'declined', 'completed'))
);
-- Create index "idx_jadwal_church_id" to table: "jadwal_pelayanan"
CREATE INDEX `idx_jadwal_church_id` ON `jadwal_pelayanan` (`church_id`);
-- Create index "idx_jadwal_kebaktian_id" to table: "jadwal_pelayanan"
CREATE INDEX `idx_jadwal_kebaktian_id` ON `jadwal_pelayanan` (`kebaktian_id`);
-- Create index "idx_jadwal_pelayan_id" to table: "jadwal_pelayanan"
CREATE INDEX `idx_jadwal_pelayan_id` ON `jadwal_pelayanan` (`pelayan_id`);
-- Create "audit_log" table
CREATE TABLE `audit_log` (
  `id` integer NULL PRIMARY KEY AUTOINCREMENT,
  `church_id` integer NOT NULL,
  `user_id` integer NULL,
  `action` text NOT NULL,
  `entity_type` text NOT NULL,
  `entity_id` integer NULL,
  `payload_json` text NULL,
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT `0` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT `1` FOREIGN KEY (`church_id`) REFERENCES `churches` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_audit_church_id" to table: "audit_log"
CREATE INDEX `idx_audit_church_id` ON `audit_log` (`church_id`);
-- Create index "idx_audit_created_at" to table: "audit_log"
CREATE INDEX `idx_audit_created_at` ON `audit_log` (`created_at`);
