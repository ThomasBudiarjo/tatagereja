-- name: ListJadwalForKebaktian :many
SELECT j.*,
       st.nama AS service_type_nama,
       st.urutan AS service_type_urutan,
       p.id AS pelayan_id_real,
       jm.id AS jemaat_id,
       jm.nama_lengkap AS pelayan_nama_lengkap,
       jm.nama_panggilan AS pelayan_nama_panggilan
FROM jadwal_pelayanan j
JOIN service_types st ON st.id = j.service_type_id
LEFT JOIN pelayan p ON p.id = j.pelayan_id
LEFT JOIN jemaat jm ON jm.id = p.jemaat_id
WHERE j.user_id = ? AND j.kebaktian_id = ?
ORDER BY st.urutan ASC, st.nama ASC;

-- name: DeleteJadwalForKebaktian :exec
DELETE FROM jadwal_pelayanan
WHERE kebaktian_id = ? AND user_id = ?;

-- name: CreateJadwal :one
INSERT INTO jadwal_pelayanan (
    user_id, kebaktian_id, service_type_id, pelayan_id, catatan
) VALUES (?, ?, ?, ?, ?)
RETURNING *;

-- name: ListJadwalForPelayan :many
SELECT j.*,
       k.nama AS kebaktian_nama,
       k.waktu_mulai AS kebaktian_waktu_mulai,
       st.nama AS service_type_nama
FROM jadwal_pelayanan j
JOIN kebaktian k ON k.id = j.kebaktian_id
JOIN service_types st ON st.id = j.service_type_id
WHERE j.user_id = ? AND j.pelayan_id = ?
ORDER BY k.waktu_mulai DESC;
