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

type UpcomingJadwalServiceType struct {
	ID    int64   `json:"id"`
	Nama  string  `json:"nama"`
	Warna *string `json:"warna"`
}

type UpcomingJadwalEntry struct {
	ID            int64                     `json:"id"`
	KebaktianID   int64                     `json:"kebaktian_id"`
	KebaktianNama string                    `json:"kebaktian_nama"`
	Tanggal       string                    `json:"tanggal"`
	WaktuMulai    string                    `json:"waktu_mulai"`
	Lokasi        *string                   `json:"lokasi"`
	ServiceType   UpcomingJadwalServiceType `json:"service_type"`
	Catatan       *string                   `json:"catatan"`
	Status        string                    `json:"status"`
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
