package models

type BirthdayEntry struct {
	JemaatID      int64   `json:"jemaat_id"`
	NamaLengkap   string  `json:"nama_lengkap"`
	NamaPanggilan *string `json:"nama_panggilan"`
	TanggalLahir  string  `json:"tanggal_lahir"`
	NextBirthday  string  `json:"next_birthday"`
	DaysUntil     int     `json:"days_until"`
	AgeTurning    int     `json:"age_turning"`
}
