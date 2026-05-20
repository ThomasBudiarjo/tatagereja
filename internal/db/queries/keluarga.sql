-- name: GetKeluarga :one
SELECT * FROM keluarga WHERE id = ? AND user_id = ?;

-- name: ListKeluarga :many
SELECT * FROM keluarga
WHERE user_id = ?
ORDER BY nama_keluarga ASC;

-- name: ListKeluargaOptions :many
SELECT id, nama_keluarga FROM keluarga
WHERE user_id = ?
ORDER BY nama_keluarga ASC;

-- name: CreateKeluarga :one
INSERT INTO keluarga (user_id, nama_keluarga, alamat, catatan)
VALUES (?, ?, ?, ?) RETURNING *;

-- name: UpdateKeluarga :one
UPDATE keluarga SET
    nama_keluarga = ?, alamat = ?, catatan = ?,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = ? AND user_id = ?
RETURNING *;

-- name: DeleteKeluarga :exec
DELETE FROM keluarga WHERE id = ? AND user_id = ?;
