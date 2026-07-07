-- name: CreateAssignment :one
INSERT INTO assignments (id, service_id, person_id, role_code)
VALUES (?, ?, ?, ?)
RETURNING *;

-- name: DeleteAssignment :exec
DELETE FROM assignments
WHERE id = ? AND service_id = ?;

-- name: ListAssignmentsByService :many
SELECT a.*, p.name AS person_name, r.name AS role_name, r.sort_order AS role_sort_order
FROM assignments a
JOIN persons p ON p.id = a.person_id
JOIN serving_roles r ON r.code = a.role_code
WHERE a.service_id = ?
ORDER BY r.sort_order, p.name COLLATE NOCASE;

-- name: ListAssignmentsBetween :many
SELECT a.*, p.name AS person_name, r.name AS role_name, r.sort_order AS role_sort_order
FROM assignments a
JOIN persons p ON p.id = a.person_id
JOIN serving_roles r ON r.code = a.role_code
JOIN services s ON s.id = a.service_id
WHERE s.service_date >= sqlc.arg(from_date) AND s.service_date <= sqlc.arg(to_date)
ORDER BY r.sort_order, p.name COLLATE NOCASE;

-- name: ListPersonAssignmentsOnDate :many
SELECT a.id, s.id AS service_id, s.start_time, s.title, pt.name AS pelayanan_type_name, r.name AS role_name
FROM assignments a
JOIN services s ON s.id = a.service_id
JOIN pelayanan_types pt ON pt.code = s.pelayanan_type_code
JOIN serving_roles r ON r.code = a.role_code
WHERE a.person_id = ? AND s.service_date = ? AND s.id != ?
ORDER BY s.start_time;
