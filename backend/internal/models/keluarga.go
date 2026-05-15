package models

import "github.com/thomas/tatagereja/backend/internal/db/sqlc"

type CreateKeluargaRequest struct {
	NamaKeluarga string  `json:"nama_keluarga" validate:"required,min=1,max=200"`
	Alamat       *string `json:"alamat" validate:"omitempty,max=500"`
	Catatan      *string `json:"catatan" validate:"omitempty,max=2000"`
}

type UpdateKeluargaRequest = CreateKeluargaRequest

type KeluargaResponse struct {
	ID           int64   `json:"id"`
	ChurchID     int64   `json:"church_id"`
	NamaKeluarga string  `json:"nama_keluarga"`
	Alamat       *string `json:"alamat"`
	Catatan      *string `json:"catatan"`
	CreatedAt    string  `json:"created_at"`
	UpdatedAt    string  `json:"updated_at"`
}

type KeluargaMember struct {
	ID            int64   `json:"id"`
	NamaLengkap   string  `json:"nama_lengkap"`
	NamaPanggilan *string `json:"nama_panggilan"`
}

type KeluargaDetailResponse struct {
	KeluargaResponse
	Members []KeluargaMember `json:"members"`
}

func KeluargaFromRow(k sqlc.Keluarga) KeluargaResponse {
	return KeluargaResponse{
		ID:           k.ID,
		ChurchID:     k.ChurchID,
		NamaKeluarga: k.NamaKeluarga,
		Alamat:       k.Alamat,
		Catatan:      k.Catatan,
		CreatedAt:    k.CreatedAt,
		UpdatedAt:    k.UpdatedAt,
	}
}
