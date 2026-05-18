-- name: GetPelayan :one
SELECT * FROM pelayan WHERE id = ? AND user_id = ?;

-- name: GetPelayanByJemaatID :one
SELECT * FROM pelayan WHERE jemaat_id = ? AND user_id = ?;

-- name: ListPelayan :many
SELECT p.*, j.nama_lengkap, j.nama_panggilan
FROM pelayan p
JOIN jemaat j ON j.id = p.jemaat_id
WHERE p.user_id = ?
ORDER BY j.nama_lengkap ASC
LIMIT ? OFFSET ?;

-- name: CountPelayan :one
SELECT COUNT(*) FROM pelayan WHERE user_id = ?;

-- name: CreatePelayan :one
INSERT INTO pelayan (user_id, jemaat_id, catatan)
VALUES (?, ?, ?)
RETURNING *;

-- name: UpdatePelayan :one
UPDATE pelayan SET
    catatan = ?,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = ? AND user_id = ?
RETURNING *;

-- name: DeletePelayan :exec
DELETE FROM pelayan WHERE id = ? AND user_id = ?;

-- name: ListPelayanServiceTypes :many
SELECT st.*
FROM pelayan_service_types pst
JOIN service_types st ON st.id = pst.service_type_id
WHERE pst.pelayan_id = ? AND st.user_id = ?
ORDER BY st.urutan ASC, st.nama ASC;

-- name: AddPelayanServiceType :exec
INSERT INTO pelayan_service_types (pelayan_id, service_type_id)
VALUES (?, ?);

-- name: DeletePelayanServiceTypes :exec
DELETE FROM pelayan_service_types WHERE pelayan_id = ?;

-- name: ListPelayanForServiceType :many
SELECT p.id, p.user_id, p.jemaat_id, p.catatan, j.nama_lengkap, j.nama_panggilan
FROM pelayan p
JOIN pelayan_service_types pst ON pst.pelayan_id = p.id
JOIN jemaat j ON j.id = p.jemaat_id
WHERE p.user_id = ? AND pst.service_type_id = ?
ORDER BY j.nama_lengkap ASC;
