-- name: CreateService :one
INSERT INTO services (id, pelayanan_type_code, service_date, start_time, title, notes)
VALUES (?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: GetService :one
SELECT s.*, pt.name AS pelayanan_type_name
FROM services s
JOIN pelayanan_types pt ON pt.code = s.pelayanan_type_code
WHERE s.id = ?;

-- name: ListServicesBetween :many
SELECT s.*, pt.name AS pelayanan_type_name
FROM services s
JOIN pelayanan_types pt ON pt.code = s.pelayanan_type_code
WHERE s.service_date >= sqlc.arg(from_date) AND s.service_date <= sqlc.arg(to_date)
ORDER BY s.service_date, s.start_time;

-- name: UpdateService :one
UPDATE services
SET pelayanan_type_code = ?, service_date = ?, start_time = ?, title = ?, notes = ?, updated_at = datetime('now')
WHERE id = ?
RETURNING *;

-- name: DeleteService :exec
DELETE FROM services
WHERE id = ?;
