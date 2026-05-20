-- name: ListJadwalByKebaktian :many
SELECT jp.*, st.nama AS service_type_nama, j.nama_lengkap AS pelayan_nama
FROM jadwal_pelayanan jp
JOIN service_types st ON st.id = jp.service_type_id AND st.user_id = jp.user_id
LEFT JOIN pelayan p ON p.id = jp.pelayan_id AND p.user_id = jp.user_id
LEFT JOIN jemaat j ON j.id = p.jemaat_id AND j.user_id = jp.user_id
WHERE jp.kebaktian_id = ? AND jp.user_id = ?
ORDER BY st.urutan ASC, st.nama ASC;

-- name: DeleteJadwalByKebaktian :exec
DELETE FROM jadwal_pelayanan WHERE kebaktian_id = ? AND user_id = ?;

-- name: CreateJadwal :one
INSERT INTO jadwal_pelayanan (user_id, kebaktian_id, service_type_id, pelayan_id, catatan, confirmed)
VALUES (?, ?, ?, ?, ?, ?) RETURNING *;
