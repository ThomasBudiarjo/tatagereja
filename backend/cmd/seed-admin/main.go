package main

import (
	"context"
	"flag"
	"log"

	"github.com/thomasbudiarjo/tatagereja/backend/internal/auth"
	"github.com/thomasbudiarjo/tatagereja/backend/internal/config"
	"github.com/thomasbudiarjo/tatagereja/backend/internal/db"
	"github.com/thomasbudiarjo/tatagereja/backend/internal/db/sqlc"
)

func main() {
	email := flag.String("email", "", "User email (required)")
	password := flag.String("password", "", "User password (required)")
	displayName := flag.String("display-name", "", "Display name (required)")
	churchName := flag.String("church-name", "", "Church name (required)")
	timezone := flag.String("timezone", "Asia/Jakarta", "Timezone (default: Asia/Jakarta)")
	flag.Parse()

	if *email == "" || *password == "" || *displayName == "" || *churchName == "" {
		log.Fatal("--email, --password, --display-name, --church-name are required")
	}

	cfg := config.MustLoad()
	database := db.MustOpen(cfg.DatabasePath)
	defer database.Close()

	if err := db.Apply(database); err != nil {
		log.Fatalf("db.Apply: %v", err)
	}

	hash, err := auth.HashPassword(*password)
	if err != nil {
		log.Fatalf("HashPassword: %v", err)
	}

	q := sqlc.New(database)
	user, err := q.UpsertUser(context.Background(), sqlc.CreateUserParams{
		Email:        *email,
		PasswordHash: hash,
		DisplayName:  *displayName,
		ChurchName:   *churchName,
		Timezone:     *timezone,
	})
	if err != nil {
		log.Fatalf("UpsertUser: %v", err)
	}

	log.Printf("User upserted: id=%d email=%s church=%s", user.ID, user.Email, user.ChurchName)
}
