-- name: ListPelayanByChurch :many
SELECT p.*, j.nama_lengkap, j.nama_panggilan
FROM pelayan p
JOIN jemaat j ON j.id = p.jemaat_id
WHERE p.church_id = ? AND p.is_active = 1
ORDER BY j.nama_lengkap ASC
LIMIT ? OFFSET ?;

-- name: CountPelayanByChurch :one
SELECT COUNT(*) FROM pelayan WHERE church_id = ? AND is_active = 1;

-- name: GetPelayanByID :one
SELECT p.*, j.nama_lengkap, j.nama_panggilan
FROM pelayan p
JOIN jemaat j ON j.id = p.jemaat_id
WHERE p.id = ? AND p.church_id = ?;

-- name: CreatePelayan :one
INSERT INTO pelayan (church_id, jemaat_id, catatan)
VALUES (?, ?, ?)
RETURNING *;

-- name: UpdatePelayan :one
UPDATE pelayan SET
    catatan = ?,
    is_active = ?,
    updated_at = datetime('now')
WHERE id = ? AND church_id = ?
RETURNING *;

-- name: DeletePelayan :exec
DELETE FROM pelayan WHERE id = ? AND church_id = ?;

-- name: GetServiceTypesForPelayan :many
SELECT st.*, pst.skill_level
FROM pelayan_service_types pst
JOIN service_types st ON st.id = pst.service_type_id
WHERE pst.pelayan_id = ?;

-- name: ClearPelayanServiceTypes :exec
DELETE FROM pelayan_service_types WHERE pelayan_id = ?;

-- name: AddPelayanServiceType :exec
INSERT INTO pelayan_service_types (pelayan_id, service_type_id)
VALUES (?, ?);
