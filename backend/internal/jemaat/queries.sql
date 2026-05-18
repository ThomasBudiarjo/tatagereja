-- name: GetJemaat :one
SELECT * FROM jemaat
WHERE id = ? AND user_id = ?;

-- name: ListJemaat :many
SELECT * FROM jemaat
WHERE user_id = ? AND is_active = 1
ORDER BY nama_lengkap ASC
LIMIT ? OFFSET ?;

-- name: CountJemaat :one
SELECT COUNT(*) FROM jemaat
WHERE user_id = ? AND is_active = 1;

-- name: SearchJemaat :many
SELECT * FROM jemaat
WHERE user_id = sqlc.arg(user_id)
  AND is_active = 1
  AND (nama_lengkap LIKE sqlc.arg(pattern)
       OR COALESCE(nama_panggilan, '') LIKE sqlc.arg(pattern)
       OR COALESCE(email, '') LIKE sqlc.arg(pattern))
ORDER BY nama_lengkap ASC
LIMIT sqlc.arg(lim) OFFSET sqlc.arg(off);

-- name: CountSearchJemaat :one
SELECT COUNT(*) FROM jemaat
WHERE user_id = sqlc.arg(user_id)
  AND is_active = 1
  AND (nama_lengkap LIKE sqlc.arg(pattern)
       OR COALESCE(nama_panggilan, '') LIKE sqlc.arg(pattern)
       OR COALESCE(email, '') LIKE sqlc.arg(pattern));

-- name: CreateJemaat :one
INSERT INTO jemaat (
    user_id, nama_lengkap, nama_panggilan, jenis_kelamin,
    tanggal_lahir, tempat_lahir, alamat, nomor_telepon, email,
    status_pernikahan, tanggal_baptis, tanggal_sidi,
    keluarga_id, catatan
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: UpdateJemaat :one
UPDATE jemaat SET
    nama_lengkap = ?, nama_panggilan = ?, jenis_kelamin = ?,
    tanggal_lahir = ?, tempat_lahir = ?, alamat = ?,
    nomor_telepon = ?, email = ?, status_pernikahan = ?,
    tanggal_baptis = ?, tanggal_sidi = ?, keluarga_id = ?,
    catatan = ?,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = ? AND user_id = ?
RETURNING *;

-- name: DeactivateJemaat :exec
UPDATE jemaat
SET is_active = 0,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = ? AND user_id = ?;

-- name: ListJemaatByKeluarga :many
SELECT * FROM jemaat
WHERE user_id = ? AND keluarga_id = ? AND is_active = 1
ORDER BY nama_lengkap ASC;
