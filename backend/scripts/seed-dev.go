package main

import (
	"context"
	"database/sql"
	"log"
	"os"

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
	queries := sqlc.New(db)

	church, _ := queries.GetChurchBySlug(ctx, "demo")
	if church.ID == 0 {
		church, err = queries.CreateChurch(ctx, sqlc.CreateChurchParams{
			Name:     "Demo Church",
			Slug:     "demo",
			Timezone: "Asia/Jakarta",
		})
		if err != nil {
			log.Fatalf("failed to create church: %v", err)
		}
		log.Printf("Created church: %s (id=%d)", church.Name, church.ID)
	}

	hash, _ := auth.HashPassword("password123")

	_, err = queries.GetUserByEmail(ctx, "admin@demo.church")
	if err == sql.ErrNoRows {
		_, err = queries.CreateUser(ctx, sqlc.CreateUserParams{
			ChurchID:     church.ID,
			Email:        "admin@demo.church",
			PasswordHash: hash,
			DisplayName:  "Admin Demo",
			Role:         "admin",
		})
		if err != nil {
			log.Fatalf("failed to create user: %v", err)
		}
		log.Println("Created admin user: admin@demo.church / password123")
	}

	jk := "L"
	alamat := "Jl. Mawar No. 1"
	_, err = queries.CreateJemaat(ctx, sqlc.CreateJemaatParams{
		ChurchID:     church.ID,
		NamaLengkap:  "Budi Santoso",
		JenisKelamin: &jk,
		Alamat:       &alamat,
	})
	if err != nil {
		log.Printf("jemaat seed: %v", err)
	}

	log.Println("Dev seed complete!")
}
