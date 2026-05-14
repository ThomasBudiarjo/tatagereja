package models

import "github.com/thomas/tatagereja/backend/internal/db/sqlc"

type CreateJemaatRequest struct {
	NamaLengkap      string  `json:"nama_lengkap" validate:"required,min=1,max=200"`
	NamaPanggilan    *string `json:"nama_panggilan" validate:"omitempty,max=100"`
	JenisKelamin     *string `json:"jenis_kelamin" validate:"omitempty,oneof=L P"`
	TanggalLahir     *string `json:"tanggal_lahir" validate:"omitempty,datetime=2006-01-02"`
	TempatLahir      *string `json:"tempat_lahir" validate:"omitempty,max=100"`
	Alamat           *string `json:"alamat" validate:"omitempty,max=500"`
	NomorTelepon     *string `json:"nomor_telepon" validate:"omitempty,max=30"`
	Email            *string `json:"email" validate:"omitempty,email,max=200"`
	StatusPernikahan *string `json:"status_pernikahan" validate:"omitempty,oneof=belum_menikah menikah cerai duda janda"`
	TanggalBaptis    *string `json:"tanggal_baptis" validate:"omitempty,datetime=2006-01-02"`
	TanggalSidi      *string `json:"tanggal_sidi" validate:"omitempty,datetime=2006-01-02"`
	KeluargaID       *int64  `json:"keluarga_id"`
	Catatan          *string `json:"catatan"`
}

type UpdateJemaatRequest = CreateJemaatRequest

type JemaatResponse struct {
	ID               int64   `json:"id"`
	ChurchID         int64   `json:"church_id"`
	NamaLengkap      string  `json:"nama_lengkap"`
	NamaPanggilan    *string `json:"nama_panggilan"`
	JenisKelamin     *string `json:"jenis_kelamin"`
	TanggalLahir     *string `json:"tanggal_lahir"`
	TempatLahir      *string `json:"tempat_lahir"`
	Alamat           *string `json:"alamat"`
	NomorTelepon     *string `json:"nomor_telepon"`
	Email            *string `json:"email"`
	StatusPernikahan *string `json:"status_pernikahan"`
	TanggalBaptis    *string `json:"tanggal_baptis"`
	TanggalSidi      *string `json:"tanggal_sidi"`
	KeluargaID       *int64  `json:"keluarga_id"`
	Catatan          *string `json:"catatan"`
	IsActive         bool    `json:"is_active"`
	CreatedAt        string  `json:"created_at"`
	UpdatedAt        string  `json:"updated_at"`
}

func JemaatFromRow(j sqlc.Jemaat) JemaatResponse {
	return JemaatResponse{
		ID:               j.ID,
		ChurchID:         j.ChurchID,
		NamaLengkap:      j.NamaLengkap,
		NamaPanggilan:    j.NamaPanggilan,
		JenisKelamin:     j.JenisKelamin,
		TanggalLahir:     j.TanggalLahir,
		TempatLahir:      j.TempatLahir,
		Alamat:           j.Alamat,
		NomorTelepon:     j.NomorTelepon,
		Email:            j.Email,
		StatusPernikahan: j.StatusPernikahan,
		TanggalBaptis:    j.TanggalBaptis,
		TanggalSidi:      j.TanggalSidi,
		KeluargaID:       j.KeluargaID,
		Catatan:          j.Catatan,
		IsActive:         j.IsActive == 1,
		CreatedAt:        j.CreatedAt,
		UpdatedAt:        j.UpdatedAt,
	}
}
