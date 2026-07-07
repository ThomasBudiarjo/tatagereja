-- name: CreatePerson :one
INSERT INTO persons (id, name, phone, notes)
VALUES (?, ?, ?, ?)
RETURNING *;

-- name: GetPerson :one
SELECT * FROM persons
WHERE id = ?;

-- name: ListPersons :many
SELECT * FROM persons
ORDER BY name COLLATE NOCASE;

-- name: UpdatePerson :one
UPDATE persons
SET name = ?, phone = ?, notes = ?, updated_at = datetime('now')
WHERE id = ?
RETURNING *;

-- name: DeletePerson :exec
DELETE FROM persons
WHERE id = ?;
