-- name: ListKebaktianByChurch :many
SELECT * FROM kebaktian
WHERE church_id = ?
  AND tanggal >= ? AND tanggal <= ?
ORDER BY tanggal ASC, waktu_mulai ASC
LIMIT ? OFFSET ?;

-- name: CountKebaktianByChurch :one
SELECT COUNT(*) FROM kebaktian
WHERE church_id = ?
  AND tanggal >= ? AND tanggal <= ?;

-- name: GetKebaktianByID :one
SELECT * FROM kebaktian WHERE id = ? AND church_id = ?;

-- name: CreateKebaktian :one
INSERT INTO kebaktian (church_id, nama, tanggal, waktu_mulai, lokasi, tema, pengkhotbah, catatan)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: UpdateKebaktian :one
UPDATE kebaktian SET
    nama = ?,
    tanggal = ?,
    waktu_mulai = ?,
    lokasi = ?,
    tema = ?,
    pengkhotbah = ?,
    catatan = ?,
    updated_at = datetime('now')
WHERE id = ? AND church_id = ?
RETURNING *;

-- name: DeleteKebaktian :exec
DELETE FROM kebaktian WHERE id = ? AND church_id = ?;

-- name: GetJadwalByKebaktian :many
SELECT jp.*, st.nama AS service_type_name, st.warna AS service_type_warna,
       p.jemaat_id, j.nama_lengkap AS pelayan_nama
FROM jadwal_pelayanan jp
JOIN service_types st ON st.id = jp.service_type_id
LEFT JOIN pelayan p ON p.id = jp.pelayan_id
LEFT JOIN jemaat j ON j.id = p.jemaat_id
WHERE jp.kebaktian_id = ? AND jp.church_id = ?
ORDER BY st.urutan ASC, st.nama ASC;

-- name: DeleteJadwalByKebaktian :exec
DELETE FROM jadwal_pelayanan WHERE kebaktian_id = ? AND church_id = ?;

-- name: CreateJadwalSlot :one
INSERT INTO jadwal_pelayanan (church_id, kebaktian_id, service_type_id, pelayan_id, catatan)
VALUES (?, ?, ?, ?, ?)
RETURNING *;

-- name: ListUpcomingJadwalForPelayan :many
SELECT jp.*, k.nama AS kebaktian_nama, k.tanggal, k.waktu_mulai, k.lokasi,
       st.nama AS service_type_name, st.warna AS service_type_warna
FROM jadwal_pelayanan jp
JOIN kebaktian k ON k.id = jp.kebaktian_id
JOIN service_types st ON st.id = jp.service_type_id
WHERE jp.church_id = ?
  AND jp.pelayan_id = ?
  AND k.tanggal >= date('now')
ORDER BY k.tanggal ASC, k.waktu_mulai ASC;
