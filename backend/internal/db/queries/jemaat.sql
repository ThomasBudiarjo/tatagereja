-- name: GetJemaatByID :one
SELECT * FROM jemaat WHERE id = ? AND church_id = ?;

-- name: ListJemaatByChurch :many
SELECT * FROM jemaat WHERE church_id = ? AND is_active = 1
ORDER BY nama_lengkap ASC
LIMIT ? OFFSET ?;

-- name: CountJemaatByChurch :one
SELECT COUNT(*) FROM jemaat WHERE church_id = ? AND is_active = 1;

-- name: SearchJemaat :many
SELECT * FROM jemaat
WHERE church_id = ? AND is_active = 1
  AND (nama_lengkap LIKE ? OR nama_panggilan LIKE ? OR email LIKE ?)
ORDER BY nama_lengkap ASC
LIMIT ? OFFSET ?;

-- name: CreateJemaat :one
INSERT INTO jemaat (
    church_id, nama_lengkap, nama_panggilan, jenis_kelamin,
    tanggal_lahir, tempat_lahir, alamat, nomor_telepon, email,
    status_pernikahan, tanggal_baptis, tanggal_sidi,
    keluarga_id, catatan
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: UpdateJemaat :one
UPDATE jemaat SET
    nama_lengkap = ?,
    nama_panggilan = ?,
    jenis_kelamin = ?,
    tanggal_lahir = ?,
    tempat_lahir = ?,
    alamat = ?,
    nomor_telepon = ?,
    email = ?,
    status_pernikahan = ?,
    tanggal_baptis = ?,
    tanggal_sidi = ?,
    keluarga_id = ?,
    catatan = ?,
    updated_at = datetime('now')
WHERE id = ? AND church_id = ?
RETURNING *;

-- name: DeactivateJemaat :exec
UPDATE jemaat SET is_active = 0, updated_at = datetime('now')
WHERE id = ? AND church_id = ?;

-- name: DeleteJemaat :exec
DELETE FROM jemaat WHERE id = ? AND church_id = ?;

-- name: ListActiveJemaatWithBirthday :many
SELECT id, nama_lengkap, nama_panggilan, tanggal_lahir
FROM jemaat
WHERE church_id = ?
  AND is_active = 1
  AND tanggal_lahir IS NOT NULL
ORDER BY nama_lengkap ASC;
