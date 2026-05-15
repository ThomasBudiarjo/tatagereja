package models

import "github.com/thomas/tatagereja/backend/internal/db/sqlc"

type CreateKebaktianRequest struct {
	Nama        string  `json:"nama" validate:"required,min=1,max=200"`
	Tanggal     string  `json:"tanggal" validate:"required,datetime=2006-01-02"`
	WaktuMulai  string  `json:"waktu_mulai" validate:"required"`
	Lokasi      *string `json:"lokasi" validate:"omitempty,max=200"`
	Tema        *string `json:"tema" validate:"omitempty,max=200"`
	Pengkhotbah *string `json:"pengkhotbah" validate:"omitempty,max=200"`
	Catatan     *string `json:"catatan"`
}

type UpdateKebaktianRequest = CreateKebaktianRequest

type KebaktianResponse struct {
	ID          int64   `json:"id"`
	ChurchID    int64   `json:"church_id"`
	Nama        string  `json:"nama"`
	Tanggal     string  `json:"tanggal"`
	WaktuMulai  string  `json:"waktu_mulai"`
	Lokasi      *string `json:"lokasi"`
	Tema        *string `json:"tema"`
	Pengkhotbah *string `json:"pengkhotbah"`
	Catatan     *string `json:"catatan"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

func KebaktianFromRow(k sqlc.Kebaktian) KebaktianResponse {
	return KebaktianResponse{
		ID:          k.ID,
		ChurchID:    k.ChurchID,
		Nama:        k.Nama,
		Tanggal:     k.Tanggal,
		WaktuMulai:  k.WaktuMulai,
		Lokasi:      k.Lokasi,
		Tema:        k.Tema,
		Pengkhotbah: k.Pengkhotbah,
		Catatan:     k.Catatan,
		CreatedAt:   k.CreatedAt,
		UpdatedAt:   k.UpdatedAt,
	}
}

type RecurringKebaktianTemplate struct {
	Nama        string  `json:"nama" validate:"required,min=1,max=200"`
	WaktuMulai  string  `json:"waktu_mulai" validate:"required"`
	Lokasi      *string `json:"lokasi" validate:"omitempty,max=200"`
	Tema        *string `json:"tema" validate:"omitempty,max=200"`
	Pengkhotbah *string `json:"pengkhotbah" validate:"omitempty,max=200"`
	Catatan     *string `json:"catatan"`
}

type RecurringKebaktianRequest struct {
	Template  RecurringKebaktianTemplate `json:"template" validate:"required"`
	StartDate string                     `json:"start_date" validate:"required,datetime=2006-01-02"`
	Weekday   int                        `json:"weekday" validate:"min=0,max=6"`
	WeekCount int                        `json:"week_count" validate:"required,min=1,max=52"`
}

type RecurringKebaktianResponse struct {
	Created []KebaktianResponse `json:"created"`
}

type JadwalSlotInput struct {
	ServiceTypeID int64   `json:"service_type_id" validate:"required"`
	PelayanID     *int64  `json:"pelayan_id"`
	Catatan       *string `json:"catatan"`
}

type BulkUpsertJadwalRequest struct {
	Slots []JadwalSlotInput `json:"slots" validate:"required,dive"`
}

type JadwalSlotResponse struct {
	ID                int64   `json:"id"`
	KebaktianID       int64   `json:"kebaktian_id"`
	ServiceTypeID     int64   `json:"service_type_id"`
	ServiceTypeName   string  `json:"service_type_name"`
	ServiceTypeWarna  *string `json:"service_type_warna"`
	PelayanID         *int64  `json:"pelayan_id"`
	PelayanJemaatID   *int64  `json:"pelayan_jemaat_id"`
	PelayanNama       *string `json:"pelayan_nama"`
	Catatan           *string `json:"catatan"`
	Status            string  `json:"status"`
}
