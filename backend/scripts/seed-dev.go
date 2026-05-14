package main

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"os"
	"strings"
	"time"

	_ "github.com/tursodatabase/libsql-client-go/libsql"
	_ "modernc.org/sqlite"

	"github.com/thomas/tatagereja/backend/internal/auth"
	"github.com/thomas/tatagereja/backend/internal/db/sqlc"
)

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "file:./local.db"
	}

	db, err := sql.Open("libsql", dsn)
	if err != nil {
		log.Fatalf("failed to open db: %v", err)
	}
	defer db.Close()

	ctx := context.Background()
	q := sqlc.New(db)

	church, err := q.GetChurchBySlug(ctx, "demo")
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		log.Fatalf("lookup church: %v", err)
	}
	if church.ID == 0 {
		church, err = q.CreateChurch(ctx, sqlc.CreateChurchParams{
			Name:     "Demo Church",
			Slug:     "demo",
			Timezone: "Asia/Jakarta",
		})
		if err != nil {
			log.Fatalf("create church: %v", err)
		}
		log.Printf("Created church: %s (id=%d)", church.Name, church.ID)
	}

	if _, err := q.GetUserByEmail(ctx, "admin@demo.church"); errors.Is(err, sql.ErrNoRows) {
		hash, hashErr := auth.HashPassword("password123")
		if hashErr != nil {
			log.Fatalf("hash: %v", hashErr)
		}
		if _, err := q.CreateUser(ctx, sqlc.CreateUserParams{
			ChurchID:     church.ID,
			Email:        "admin@demo.church",
			PasswordHash: hash,
			DisplayName:  "Admin Demo",
			Role:         "admin",
		}); err != nil {
			log.Fatalf("create user: %v", err)
		}
		log.Println("Created admin user: admin@demo.church / password123")
	}

	count, err := q.CountJemaatByChurch(ctx, church.ID)
	if err != nil {
		log.Fatalf("count jemaat: %v", err)
	}
	if count > 0 {
		log.Printf("Church already has %d jemaat. Skipping data seed.", count)
		return
	}

	jemaatSamples := []sqlc.CreateJemaatParams{
		{NamaLengkap: "Budi Santoso", NamaPanggilan: strp("Budi"), JenisKelamin: strp("L"), TanggalLahir: strp("1980-03-15"), TempatLahir: strp("Semarang"), Alamat: strp("Jl. Mawar No. 1"), Email: strp("budi@demo.church"), StatusPernikahan: strp("menikah"), TanggalBaptis: strp("1995-06-20"), TanggalSidi: strp("1998-08-15")},
		{NamaLengkap: "Sari Wulandari", NamaPanggilan: strp("Sari"), JenisKelamin: strp("P"), TanggalLahir: strp("1985-07-22"), TempatLahir: strp("Yogyakarta"), Alamat: strp("Jl. Melati No. 3"), Email: strp("sari@demo.church"), StatusPernikahan: strp("menikah"), TanggalBaptis: strp("2000-01-10")},
		{NamaLengkap: "Andre Wijaya", NamaPanggilan: strp("Andre"), JenisKelamin: strp("L"), TanggalLahir: strp("1992-11-05"), Alamat: strp("Jl. Anggrek No. 7"), Email: strp("andre@demo.church"), StatusPernikahan: strp("belum_menikah"), TanggalSidi: strp("2010-04-18")},
		{NamaLengkap: "Maria Tanudjaja", NamaPanggilan: strp("Maria"), JenisKelamin: strp("P"), TanggalLahir: strp("1995-02-28"), Alamat: strp("Jl. Kenanga No. 9"), Email: strp("maria@demo.church"), StatusPernikahan: strp("belum_menikah")},
		{NamaLengkap: "Petrus Halim", NamaPanggilan: strp("Petrus"), JenisKelamin: strp("L"), TanggalLahir: strp("1975-09-12"), Alamat: strp("Jl. Dahlia No. 12"), StatusPernikahan: strp("menikah")},
		{NamaLengkap: "Yohanna Setiawati", NamaPanggilan: strp("Hanna"), JenisKelamin: strp("P"), TanggalLahir: strp("1988-12-01"), Alamat: strp("Jl. Tulip No. 4"), StatusPernikahan: strp("menikah")},
		{NamaLengkap: "Daniel Pranata", NamaPanggilan: strp("Daniel"), JenisKelamin: strp("L"), TanggalLahir: strp("1990-04-19"), Alamat: strp("Jl. Cempaka No. 8"), StatusPernikahan: strp("belum_menikah")},
		{NamaLengkap: "Esther Cahyadi", NamaPanggilan: strp("Esther"), JenisKelamin: strp("P"), TanggalLahir: strp("1993-08-30"), Alamat: strp("Jl. Bougenville No. 5"), StatusPernikahan: strp("belum_menikah")},
		{NamaLengkap: "Markus Hartono", NamaPanggilan: strp("Markus"), JenisKelamin: strp("L"), TanggalLahir: strp("1978-06-14"), Alamat: strp("Jl. Sakura No. 2"), StatusPernikahan: strp("menikah")},
		{NamaLengkap: "Lidia Wibowo", NamaPanggilan: strp("Lidia"), JenisKelamin: strp("P"), TanggalLahir: strp("1982-10-25"), Alamat: strp("Jl. Flamboyan No. 6"), StatusPernikahan: strp("menikah")},
	}

	createdJemaat := make([]sqlc.Jemaat, 0, len(jemaatSamples))
	for _, p := range jemaatSamples {
		p.ChurchID = church.ID
		j, err := q.CreateJemaat(ctx, p)
		if err != nil {
			log.Fatalf("create jemaat %q: %v", p.NamaLengkap, err)
		}
		createdJemaat = append(createdJemaat, j)
	}
	log.Printf("Seeded %d jemaat.", len(createdJemaat))

	serviceTypeSamples := []sqlc.CreateServiceTypeParams{
		{ChurchID: church.ID, Nama: "Worship Leader", Deskripsi: strp("Memimpin pujian"), Warna: strp("#3b82f6"), Urutan: 1},
		{ChurchID: church.ID, Nama: "Singer", Deskripsi: strp("Backing vokal"), Warna: strp("#10b981"), Urutan: 2},
		{ChurchID: church.ID, Nama: "Multimedia", Deskripsi: strp("Pengoperasian slide & sound"), Warna: strp("#f59e0b"), Urutan: 3},
		{ChurchID: church.ID, Nama: "Usher", Deskripsi: strp("Penyambut jemaat"), Warna: strp("#ef4444"), Urutan: 4},
	}
	createdST := make([]sqlc.ServiceType, 0, len(serviceTypeSamples))
	for _, p := range serviceTypeSamples {
		st, err := q.CreateServiceType(ctx, p)
		if err != nil {
			log.Fatalf("create service type: %v", err)
		}
		createdST = append(createdST, st)
	}
	log.Printf("Seeded %d service types.", len(createdST))

	pelayanSetup := []struct {
		jemaatIdx int
		stIdx     []int
		catatan   string
	}{
		{jemaatIdx: 0, stIdx: []int{0, 1}, catatan: "Tersedia setiap Minggu pagi"},
		{jemaatIdx: 1, stIdx: []int{1}, catatan: "Vocal soprano"},
		{jemaatIdx: 2, stIdx: []int{2}, catatan: "Familiar dengan ProPresenter"},
		{jemaatIdx: 3, stIdx: []int{3}, catatan: ""},
	}
	createdPelayan := make([]sqlc.Pelayan, 0, len(pelayanSetup))
	for _, p := range pelayanSetup {
		j := createdJemaat[p.jemaatIdx]
		var catPtr *string
		if p.catatan != "" {
			c := p.catatan
			catPtr = &c
		}
		pel, err := q.CreatePelayan(ctx, sqlc.CreatePelayanParams{
			ChurchID: church.ID,
			JemaatID: j.ID,
			Catatan:  catPtr,
		})
		if err != nil {
			log.Fatalf("create pelayan: %v", err)
		}
		for _, idx := range p.stIdx {
			if err := q.AddPelayanServiceType(ctx, sqlc.AddPelayanServiceTypeParams{
				PelayanID:     pel.ID,
				ServiceTypeID: createdST[idx].ID,
			}); err != nil {
				log.Fatalf("link pelayan service type: %v", err)
			}
		}
		createdPelayan = append(createdPelayan, pel)
	}
	log.Printf("Seeded %d pelayan.", len(createdPelayan))

	now := time.Now().UTC()
	upcomingSundays := []time.Time{
		nextSunday(now),
		nextSunday(now).AddDate(0, 0, 7),
	}
	for _, d := range upcomingSundays {
		tanggal := d.Format("2006-01-02")
		nama := "Kebaktian Minggu Pagi"
		k, err := q.CreateKebaktian(ctx, sqlc.CreateKebaktianParams{
			ChurchID:    church.ID,
			Nama:        nama,
			Tanggal:     tanggal,
			WaktuMulai:  "09:00",
			Lokasi:      strp("Auditorium Utama"),
			Tema:        strp("Bersyukur dalam segala hal"),
			Pengkhotbah: strp("Pdt. Yohanes Tan"),
		})
		if err != nil {
			log.Fatalf("create kebaktian: %v", err)
		}
		for stIdx, st := range createdST {
			var pelayanID *int64
			if stIdx < len(createdPelayan) {
				pid := createdPelayan[stIdx].ID
				pelayanID = &pid
			}
			if _, err := q.CreateJadwalSlot(ctx, sqlc.CreateJadwalSlotParams{
				ChurchID:      church.ID,
				KebaktianID:   k.ID,
				ServiceTypeID: st.ID,
				PelayanID:     pelayanID,
			}); err != nil {
				log.Fatalf("create jadwal slot: %v", err)
			}
		}
		log.Printf("Seeded kebaktian %s on %s with %d jadwal slots.", nama, tanggal, len(createdST))
	}

	log.Println(strings.Repeat("-", 40))
	log.Println("Dev seed complete!")
	log.Println("Login: admin@demo.church / password123")
}

func nextSunday(t time.Time) time.Time {
	delta := int(time.Sunday - t.Weekday())
	if delta <= 0 {
		delta += 7
	}
	return time.Date(t.Year(), t.Month(), t.Day()+delta, 0, 0, 0, 0, t.Location())
}

func strp(s string) *string {
	return &s
}
