// Command seed-dev wipes any existing dev user and seeds a full demo dataset
// (service types, jemaat, pelayan, kebaktian, jadwal) for local development.
// It is safe to re-run: it only ever touches the --email user.
package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"log"
	"time"

	"github.com/tatagereja/tatagereja/internal/auth"
	"github.com/tatagereja/tatagereja/internal/config"
	"github.com/tatagereja/tatagereja/internal/db"
	"github.com/tatagereja/tatagereja/internal/db/sqlc"
)

func main() {
	email := flag.String("email", "dev@example.com", "dev email")
	password := flag.String("password", "1234", "dev password")
	displayName := flag.String("display-name", "Dev User", "display name")
	churchName := flag.String("church-name", "GKI Dev", "church name")
	timezone := flag.String("timezone", "Asia/Jakarta", "IANA timezone")
	flag.Parse()

	cfg := config.MustLoad()
	ctx := context.Background()

	database, store, err := db.Open(ctx, cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer database.Close()
	defer func() {
		syncCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := db.SyncAndClose(syncCtx, store); err != nil {
			log.Printf("litestream sync/close: %v", err)
		}
	}()

	if err := db.Apply(database); err != nil {
		log.Fatal(err)
	}

	loc, err := time.LoadLocation(*timezone)
	if err != nil {
		log.Fatalf("load timezone %q: %v", *timezone, err)
	}

	if err := seed(ctx, database, seedParams{
		email:       *email,
		password:    *password,
		displayName: *displayName,
		churchName:  *churchName,
		timezone:    *timezone,
		loc:         loc,
	}); err != nil {
		log.Fatal(err)
	}
}

type seedParams struct {
	email       string
	password    string
	displayName string
	churchName  string
	timezone    string
	loc         *time.Location
}

func seed(ctx context.Context, database *sql.DB, p seedParams) error {
	// Clear any prior dev user; ON DELETE CASCADE wipes all their child rows.
	if _, err := database.ExecContext(ctx, "DELETE FROM users WHERE email = ?", p.email); err != nil {
		return fmt.Errorf("delete existing dev user: %w", err)
	}

	q := sqlc.New(database)

	hash, err := auth.HashPassword(p.password)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	user, err := q.CreateUser(ctx, sqlc.CreateUserParams{
		Email:        p.email,
		PasswordHash: hash,
		DisplayName:  p.displayName,
		ChurchName:   p.churchName,
		Timezone:     p.timezone,
	})
	if err != nil {
		return fmt.Errorf("create user: %w", err)
	}
	uid := user.ID

	// --- Service types (tipe pelayan) ---
	serviceTypeDefs := []struct {
		nama, deskripsi string
	}{
		{"Pengkhotbah", "Pembawa firman / kotbah"},
		{"Pemimpin Pujian", "Worship leader / liturgis"},
		{"Pemusik", "Pemain alat musik pengiring"},
		{"Singer", "Vokal pendukung pujian"},
		{"Pembaca Alkitab", "Membacakan bacaan firman"},
		{"Penyambut Jemaat", "Menyambut jemaat di pintu masuk"},
		{"Operator Multimedia", "Operator slide / sound / streaming"},
		{"Kolektan", "Mengedarkan kantong persembahan"},
	}
	serviceTypeIDs := make([]int64, 0, len(serviceTypeDefs))
	for i, st := range serviceTypeDefs {
		row, err := q.CreateServiceType(ctx, sqlc.CreateServiceTypeParams{
			UserID:    uid,
			Nama:      st.nama,
			Deskripsi: nullStr(st.deskripsi),
			Urutan:    int64(i),
		})
		if err != nil {
			return fmt.Errorf("create service type %q: %w", st.nama, err)
		}
		serviceTypeIDs = append(serviceTypeIDs, row.ID)
	}

	// --- Jemaat (members) ---
	jemaatDefs := []struct {
		nama, panggilan, jk, lahir, telp, status string
	}{
		{"Budi Santoso", "Budi", "L", "1985-03-12", "081234560001", "menikah"},
		{"Siti Rahmawati", "Siti", "P", "1990-07-22", "081234560002", "menikah"},
		{"Andreas Wijaya", "Andre", "L", "1998-11-05", "081234560003", "belum_menikah"},
		{"Maria Kristanti", "Maria", "P", "2001-01-30", "081234560004", "belum_menikah"},
		{"Yohanes Tanuwijaya", "Yohan", "L", "1976-09-18", "081234560005", "menikah"},
		{"Ruth Anggraini", "Ruth", "P", "1995-05-14", "081234560006", "belum_menikah"},
		{"Daniel Pratama", "Daniel", "L", "1988-12-02", "081234560007", "menikah"},
		{"Hana Lestari", "Hana", "P", "2003-08-09", "", ""},
	}
	jemaatIDs := make([]int64, 0, len(jemaatDefs))
	for _, j := range jemaatDefs {
		row, err := q.CreateJemaat(ctx, sqlc.CreateJemaatParams{
			UserID:           uid,
			NamaLengkap:      j.nama,
			NamaPanggilan:    nullStr(j.panggilan),
			JenisKelamin:     nullStr(j.jk),
			TanggalLahir:     nullStr(j.lahir),
			NomorTelepon:     nullStr(j.telp),
			StatusPernikahan: nullStr(j.status),
		})
		if err != nil {
			return fmt.Errorf("create jemaat %q: %w", j.nama, err)
		}
		jemaatIDs = append(jemaatIDs, row.ID)
	}

	// --- Pelayan (servants), each linked to 1-2 service types ---
	// Indexes into serviceTypeIDs that each servant can fill.
	pelayanDefs := []struct {
		jemaatIdx    int
		serviceTypes []int
	}{
		{0, []int{0, 4}},    // Budi: Pengkhotbah, Pembaca Alkitab
		{1, []int{1, 3}},    // Siti: Pemimpin Pujian, Singer
		{2, []int{2, 6}},    // Andreas: Pemusik, Operator Multimedia
		{4, []int{0, 5}},    // Yohanes: Pengkhotbah, Penyambut Jemaat
		{5, []int{3, 7}},    // Ruth: Singer, Kolektan
		{6, []int{2, 5}},    // Daniel: Pemusik, Penyambut Jemaat
	}
	// service_type_id -> list of pelayan_id able to fill it (for round-robin below).
	pelayanByType := make(map[int64][]int64)
	for _, pd := range pelayanDefs {
		pel, err := q.CreatePelayan(ctx, sqlc.CreatePelayanParams{
			UserID:   uid,
			JemaatID: jemaatIDs[pd.jemaatIdx],
		})
		if err != nil {
			return fmt.Errorf("create pelayan for jemaat %d: %w", pd.jemaatIdx, err)
		}
		for _, stIdx := range pd.serviceTypes {
			stID := serviceTypeIDs[stIdx]
			if err := q.InsertPelayanServiceType(ctx, sqlc.InsertPelayanServiceTypeParams{
				PelayanID:     pel.ID,
				ServiceTypeID: stID,
			}); err != nil {
				return fmt.Errorf("link pelayan %d to service type %d: %w", pel.ID, stID, err)
			}
			pelayanByType[stID] = append(pelayanByType[stID], pel.ID)
		}
	}

	// --- Kebaktian (services): ~2 past + ~4 upcoming Sundays, morning & evening ---
	sundays := sundaysAround(time.Now().In(p.loc), 2, 4)
	tema := []string{
		"Kasih yang Memulihkan", "Berakar dalam Firman", "Pengharapan yang Hidup",
		"Bersyukur dalam Segala Hal", "Dipanggil untuk Melayani", "Setia sampai Akhir",
	}
	pengkhotbah := []string{"Pdt. Budi Santoso", "Pdt. Yohanes Tanuwijaya", "Pdt. Tamu"}
	kebaktianIDs := make([]int64, 0, len(sundays)*2)
	for i, sun := range sundays {
		services := []struct {
			nama, jam, lokasi string
		}{
			{"Kebaktian Umum I", "08:00", "Ruang Ibadah Utama"},
			{"Kebaktian Umum II", "17:00", "Ruang Ibadah Utama"},
		}
		for s, svc := range services {
			waktuLocal := fmt.Sprintf("%sT%s", sun.Format("2006-01-02"), svc.jam)
			waktuUTC, err := localToUTC(waktuLocal, p.loc)
			if err != nil {
				return fmt.Errorf("convert kebaktian time %q: %w", waktuLocal, err)
			}
			row, err := q.CreateKebaktian(ctx, sqlc.CreateKebaktianParams{
				UserID:      uid,
				Nama:        svc.nama,
				WaktuMulai:  waktuUTC,
				Lokasi:      nullStr(svc.lokasi),
				Tema:        nullStr(tema[(i*2+s)%len(tema)]),
				Pengkhotbah: nullStr(pengkhotbah[(i*2+s)%len(pengkhotbah)]),
			})
			if err != nil {
				return fmt.Errorf("create kebaktian %q: %w", svc.nama, err)
			}
			kebaktianIDs = append(kebaktianIDs, row.ID)
		}
	}

	// --- Jadwal (slot assignments): one slot per service type per kebaktian ---
	rr := make(map[int64]int) // round-robin cursor per service type
	jadwalCount := 0
	for ki, kid := range kebaktianIDs {
		for sti, stID := range serviceTypeIDs {
			candidates := pelayanByType[stID]
			var pelayanID sql.NullInt64
			// Leave the first service type of every other kebaktian unassigned.
			if len(candidates) > 0 && !(sti == 0 && ki%2 == 1) {
				pelayanID = sql.NullInt64{Int64: candidates[rr[stID]%len(candidates)], Valid: true}
				rr[stID]++
			}
			confirmed := int64(0)
			if pelayanID.Valid && ki%2 == 0 {
				confirmed = 1
			}
			if _, err := q.CreateJadwal(ctx, sqlc.CreateJadwalParams{
				UserID:        uid,
				KebaktianID:   kid,
				ServiceTypeID: stID,
				PelayanID:     pelayanID,
				Confirmed:     confirmed,
			}); err != nil {
				return fmt.Errorf("create jadwal kebaktian=%d service_type=%d: %w", kid, stID, err)
			}
			jadwalCount++
		}
	}

	fmt.Printf("dev user %s ready (password: %s)\n", p.email, p.password)
	fmt.Printf("seeded: %d service types, %d jemaat, %d pelayan, %d kebaktian, %d jadwal\n",
		len(serviceTypeIDs), len(jemaatIDs), len(pelayanDefs), len(kebaktianIDs), jadwalCount)
	return nil
}

// sundaysAround returns Sunday dates relative to now: `past` Sundays before the
// current week's Sunday, then `upcoming` Sundays from this week's Sunday onward.
func sundaysAround(now time.Time, past, upcoming int) []time.Time {
	// Sunday of the current week (Go: Sunday == 0).
	thisSunday := now.AddDate(0, 0, -int(now.Weekday()))
	thisSunday = time.Date(thisSunday.Year(), thisSunday.Month(), thisSunday.Day(), 0, 0, 0, 0, now.Location())

	out := make([]time.Time, 0, past+upcoming)
	for i := past; i >= 1; i-- {
		out = append(out, thisSunday.AddDate(0, 0, -7*i))
	}
	for i := range upcoming {
		out = append(out, thisSunday.AddDate(0, 0, 7*i))
	}
	return out
}

// localToUTC converts a "2006-01-02T15:04" wall-clock time in loc to the UTC ISO
// string format the app stores in waktu_mulai (mirrors internal/web/web.go).
func localToUTC(local string, loc *time.Location) (string, error) {
	t, err := time.ParseInLocation("2006-01-02T15:04", local, loc)
	if err != nil {
		return "", err
	}
	return t.UTC().Format("2006-01-02T15:04:05.000000Z"), nil
}

func nullStr(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}
