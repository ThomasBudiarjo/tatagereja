-- name: ListServiceTypesByChurch :many
SELECT * FROM service_types
WHERE church_id = ? AND is_active = 1
ORDER BY urutan ASC, nama ASC;

-- name: GetServiceTypeByID :one
SELECT * FROM service_types WHERE id = ? AND church_id = ?;

-- name: CreateServiceType :one
INSERT INTO service_types (church_id, nama, deskripsi, warna, urutan)
VALUES (?, ?, ?, ?, ?)
RETURNING *;

-- name: UpdateServiceType :one
UPDATE service_types SET
    nama = ?,
    deskripsi = ?,
    warna = ?,
    urutan = ?,
    updated_at = datetime('now')
WHERE id = ? AND church_id = ?
RETURNING *;

-- name: DeleteServiceType :exec
DELETE FROM service_types WHERE id = ? AND church_id = ?;
