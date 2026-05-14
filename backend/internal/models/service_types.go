package models

import "github.com/thomas/tatagereja/backend/internal/db/sqlc"

type CreateServiceTypeRequest struct {
	Nama      string  `json:"nama" validate:"required,min=1,max=100"`
	Deskripsi *string `json:"deskripsi" validate:"omitempty,max=500"`
	Warna     *string `json:"warna" validate:"omitempty,max=20"`
	Urutan    int64   `json:"urutan"`
}

type UpdateServiceTypeRequest = CreateServiceTypeRequest

type ServiceTypeResponse struct {
	ID        int64   `json:"id"`
	ChurchID  int64   `json:"church_id"`
	Nama      string  `json:"nama"`
	Deskripsi *string `json:"deskripsi"`
	Warna     *string `json:"warna"`
	Urutan    int64   `json:"urutan"`
	IsActive  bool    `json:"is_active"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
}

func ServiceTypeFromRow(s sqlc.ServiceType) ServiceTypeResponse {
	return ServiceTypeResponse{
		ID:        s.ID,
		ChurchID:  s.ChurchID,
		Nama:      s.Nama,
		Deskripsi: s.Deskripsi,
		Warna:     s.Warna,
		Urutan:    s.Urutan,
		IsActive:  s.IsActive == 1,
		CreatedAt: s.CreatedAt,
		UpdatedAt: s.UpdatedAt,
	}
}
