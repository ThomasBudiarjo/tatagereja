-- name: GetPelayan :one
SELECT p.*, j.nama_lengkap AS jemaat_nama
FROM pelayan p
JOIN jemaat j ON j.id = p.jemaat_id
WHERE p.id = ? AND p.user_id = ?;

-- name: ListPelayan :many
SELECT p.*, j.nama_lengkap AS jemaat_nama
FROM pelayan p
JOIN jemaat j ON j.id = p.jemaat_id
WHERE p.user_id = ?
ORDER BY j.nama_lengkap ASC;

-- name: CreatePelayan :one
INSERT INTO pelayan (user_id, jemaat_id, catatan)
VALUES (?, ?, ?) RETURNING *;

-- name: UpdatePelayan :one
UPDATE pelayan SET
    catatan    = ?,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id = ? AND user_id = ? RETURNING *;

-- name: DeletePelayan :exec
DELETE FROM pelayan WHERE id = ? AND user_id = ?;

-- name: GetPelayanByJemaat :one
SELECT * FROM pelayan WHERE jemaat_id = ? AND user_id = ?;

-- name: SetPelayanServiceTypes :exec
DELETE FROM pelayan_service_types WHERE pelayan_id = ?;

-- name: AddPelayanServiceType :exec
INSERT INTO pelayan_service_types (pelayan_id, service_type_id) VALUES (?, ?);

-- name: GetPelayanServiceTypes :many
SELECT st.* FROM service_types st
JOIN pelayan_service_types pst ON pst.service_type_id = st.id
WHERE pst.pelayan_id = ?
ORDER BY st.urutan ASC, st.nama ASC;
