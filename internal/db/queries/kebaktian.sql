-- name: GetKebaktian :one
SELECT * FROM kebaktian WHERE id = ? AND user_id = ?;

-- name: ListKebaktian :many
SELECT * FROM kebaktian
WHERE user_id = ?
ORDER BY waktu_mulai DESC
LIMIT ? OFFSET ?;

-- name: ListKebaktianRange :many
SELECT * FROM kebaktian
WHERE user_id = ? AND waktu_mulai >= ? AND waktu_mulai <= ?
ORDER BY waktu_mulai ASC;

-- name: CreateKebaktian :one
INSERT INTO kebaktian (user_id, nama, waktu_mulai, lokasi, tema, pengkhotbah, catatan)
VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *;

-- name: UpdateKebaktian :one
UPDATE kebaktian SET
    nama = ?, waktu_mulai = ?, lokasi = ?, tema = ?, pengkhotbah = ?, catatan = ?,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = ? AND user_id = ?
RETURNING *;

-- name: DeleteKebaktian :exec
DELETE FROM kebaktian WHERE id = ? AND user_id = ?;
