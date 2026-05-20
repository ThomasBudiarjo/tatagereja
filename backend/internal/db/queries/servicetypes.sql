-- name: GetServiceType :one
SELECT * FROM service_types WHERE id = ? AND user_id = ?;

-- name: ListServiceTypes :many
SELECT * FROM service_types
WHERE user_id = ?
ORDER BY urutan ASC, nama ASC;

-- name: CreateServiceType :one
INSERT INTO service_types (user_id, nama, deskripsi, urutan)
VALUES (?, ?, ?, ?) RETURNING *;

-- name: UpdateServiceType :one
UPDATE service_types SET
    nama       = ?,
    deskripsi  = ?,
    urutan     = ?,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id = ? AND user_id = ? RETURNING *;

-- name: DeleteServiceType :exec
DELETE FROM service_types WHERE id = ? AND user_id = ?;
