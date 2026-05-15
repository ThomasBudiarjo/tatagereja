-- name: ListKeluargaByChurch :many
SELECT * FROM keluarga
WHERE church_id = ?
ORDER BY nama_keluarga ASC
LIMIT ? OFFSET ?;

-- name: SearchKeluarga :many
SELECT * FROM keluarga
WHERE church_id = ?
  AND (nama_keluarga LIKE ? OR alamat LIKE ?)
ORDER BY nama_keluarga ASC
LIMIT ? OFFSET ?;

-- name: CountKeluargaByChurch :one
SELECT COUNT(*) FROM keluarga WHERE church_id = ?;

-- name: GetKeluargaByID :one
SELECT * FROM keluarga WHERE id = ? AND church_id = ?;

-- name: CreateKeluarga :one
INSERT INTO keluarga (church_id, nama_keluarga, alamat, catatan)
VALUES (?, ?, ?, ?)
RETURNING *;

-- name: UpdateKeluarga :one
UPDATE keluarga SET
    nama_keluarga = ?,
    alamat = ?,
    catatan = ?,
    updated_at = datetime('now')
WHERE id = ? AND church_id = ?
RETURNING *;

-- name: DeleteKeluarga :exec
DELETE FROM keluarga WHERE id = ? AND church_id = ?;

-- name: ListJemaatByKeluarga :many
SELECT * FROM jemaat
WHERE keluarga_id = ? AND church_id = ? AND is_active = 1
ORDER BY nama_lengkap ASC;
