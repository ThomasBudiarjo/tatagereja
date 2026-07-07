-- name: ListServingRoles :many
SELECT * FROM serving_roles
ORDER BY sort_order, name;

-- name: GetServingRole :one
SELECT * FROM serving_roles
WHERE code = ?;

-- name: CreateServingRole :one
INSERT INTO serving_roles (code, name, sort_order)
VALUES (?, ?, ?)
RETURNING *;

-- name: UpdateServingRole :one
UPDATE serving_roles
SET name = ?, sort_order = ?
WHERE code = ?
RETURNING *;

-- name: DeleteServingRole :exec
DELETE FROM serving_roles
WHERE code = ?;
