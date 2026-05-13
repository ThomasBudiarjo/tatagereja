package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"log"
	"os"

	_ "github.com/tursodatabase/libsql-client-go/libsql"
	_ "modernc.org/sqlite"

	"github.com/thomas/tatagereja/backend/internal/auth"
	"github.com/thomas/tatagereja/backend/internal/db/sqlc"
)

func main() {
	churchSlug := flag.String("church-slug", "", "Church slug")
	churchName := flag.String("church-name", "", "Church name")
	email := flag.String("email", "", "Admin email")
	password := flag.String("password", "", "Admin password")
	flag.Parse()

	if *churchSlug == "" || *churchName == "" || *email == "" || *password == "" {
		fmt.Println("Usage: seed-admin --church-slug=... --church-name=... --email=... --password=...")
		os.Exit(1)
	}

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is required")
	}

	db, err := sql.Open("libsql", dsn)
	if err != nil {
		log.Fatalf("failed to open db: %v", err)
	}
	defer db.Close()

	if err := db.PingContext(context.Background()); err != nil {
		log.Fatalf("failed to ping db: %v", err)
	}

	queries := sqlc.New(db)
	ctx := context.Background()

	church, err := queries.GetChurchBySlug(ctx, *churchSlug)
	if err != nil && err != sql.ErrNoRows {
		log.Fatalf("failed to lookup church: %v", err)
	}

	if church.ID == 0 {
		church, err = queries.CreateChurch(ctx, sqlc.CreateChurchParams{
			Name:     *churchName,
			Slug:     *churchSlug,
			Timezone: "Asia/Jakarta",
		})
		if err != nil {
			log.Fatalf("failed to create church: %v", err)
		}
		fmt.Printf("Created church: %s (id=%d)\n", *churchName, church.ID)
	}

	hash, err := auth.HashPassword(*password)
	if err != nil {
		log.Fatalf("failed to hash password: %v", err)
	}

	user, err := queries.CreateUser(ctx, sqlc.CreateUserParams{
		ChurchID:     church.ID,
		Email:        *email,
		PasswordHash: hash,
		DisplayName:  "Admin",
		Role:         "admin",
	})
	if err != nil {
		log.Fatalf("failed to create user: %v", err)
	}

	fmt.Printf("Created admin user: %s (id=%d) for church %s\n", *email, user.ID, *churchName)
	fmt.Println("Seed complete!")
}
