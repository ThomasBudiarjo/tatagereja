-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = ? AND is_active = 1;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = ?;

-- name: CreateUser :one
INSERT INTO users (church_id, email, password_hash, display_name, role)
VALUES (?, ?, ?, ?, ?)
RETURNING *;

-- name: UpdateLastLogin :exec
UPDATE users SET last_login_at = datetime('now'), updated_at = datetime('now')
WHERE id = ?;
