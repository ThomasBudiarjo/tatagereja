package models

type CreatePelayanRequest struct {
	JemaatID       int64   `json:"jemaat_id" validate:"required"`
	Catatan        *string `json:"catatan"`
	ServiceTypeIDs []int64 `json:"service_type_ids" validate:"required"`
}

type UpdatePelayanRequest struct {
	Catatan        *string `json:"catatan"`
	IsActive       *bool   `json:"is_active"`
	ServiceTypeIDs []int64 `json:"service_type_ids" validate:"required"`
}

type PelayanServiceTypeRef struct {
	ID         int64   `json:"id"`
	Nama       string  `json:"nama"`
	Warna      *string `json:"warna"`
	SkillLevel *string `json:"skill_level"`
}

type PelayanResponse struct {
	ID            int64                   `json:"id"`
	ChurchID      int64                   `json:"church_id"`
	JemaatID      int64                   `json:"jemaat_id"`
	NamaLengkap   string                  `json:"nama_lengkap"`
	NamaPanggilan *string                 `json:"nama_panggilan"`
	Catatan       *string                 `json:"catatan"`
	IsActive      bool                    `json:"is_active"`
	ServiceTypes  []PelayanServiceTypeRef `json:"service_types"`
	CreatedAt     string                  `json:"created_at"`
	UpdatedAt     string                  `json:"updated_at"`
}
