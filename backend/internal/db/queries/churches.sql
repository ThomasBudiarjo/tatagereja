-- name: GetChurchBySlug :one
SELECT * FROM churches WHERE slug = ?;

-- name: GetChurchByID :one
SELECT * FROM churches WHERE id = ?;

-- name: CreateChurch :one
INSERT INTO churches (name, slug, timezone) VALUES (?, ?, ?) RETURNING *;
