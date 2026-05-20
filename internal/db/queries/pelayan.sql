-- name: GetPelayan :one
SELECT * FROM pelayan WHERE id = ? AND user_id = ?;

-- name: ListPelayan :many
SELECT p.*, j.nama_lengkap AS jemaat_nama
FROM pelayan p
JOIN jemaat j ON j.id = p.jemaat_id AND j.user_id = p.user_id
WHERE p.user_id = ?
ORDER BY j.nama_lengkap ASC;

-- name: CreatePelayan :one
INSERT INTO pelayan (user_id, jemaat_id, catatan)
VALUES (?, ?, ?) RETURNING *;

-- name: UpdatePelayan :one
UPDATE pelayan SET
    jemaat_id = ?, catatan = ?,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = ? AND user_id = ?
RETURNING *;

-- name: DeletePelayan :exec
DELETE FROM pelayan WHERE id = ? AND user_id = ?;

-- name: DeletePelayanServiceTypes :exec
DELETE FROM pelayan_service_types WHERE pelayan_id = ?;

-- name: InsertPelayanServiceType :exec
INSERT INTO pelayan_service_types (pelayan_id, service_type_id)
VALUES (?, ?);

-- name: ListPelayanServiceTypeIDs :many
SELECT service_type_id FROM pelayan_service_types
WHERE pelayan_id = ?;

-- name: ListPelayanServiceTypeNames :many
SELECT st.nama
FROM pelayan_service_types pst
JOIN service_types st ON st.id = pst.service_type_id
WHERE pst.pelayan_id = ?
ORDER BY st.urutan ASC, st.nama ASC;

-- name: ListPelayanForServiceType :many
SELECT p.id, j.nama_lengkap AS jemaat_nama
FROM pelayan p
JOIN jemaat j ON j.id = p.jemaat_id AND j.user_id = p.user_id
JOIN pelayan_service_types pst ON pst.pelayan_id = p.id
WHERE p.user_id = ? AND pst.service_type_id = ?
ORDER BY j.nama_lengkap ASC;
