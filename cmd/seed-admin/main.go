package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/tatagereja/tatagereja/internal/auth"
	"github.com/tatagereja/tatagereja/internal/config"
	"github.com/tatagereja/tatagereja/internal/db"
	"github.com/tatagereja/tatagereja/internal/db/sqlc"
)

func main() {
	email := flag.String("email", "", "admin email")
	password := flag.String("password", "", "admin password")
	displayName := flag.String("display-name", "", "display name")
	churchName := flag.String("church-name", "", "church name")
	timezone := flag.String("timezone", "Asia/Jakarta", "IANA timezone")
	flag.Parse()

	if *email == "" || *password == "" || *displayName == "" || *churchName == "" {
		fmt.Fprintln(os.Stderr, "usage: seed-admin --email=... --password=... --display-name=... --church-name=...")
		os.Exit(2)
	}

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

	q := sqlc.New(database)
	hash, err := auth.HashPassword(*password)
	if err != nil {
		log.Fatal(err)
	}

	existing, err := q.GetUserByEmail(ctx, *email)
	if err == nil {
		_, err = q.UpdateUserByEmail(ctx, sqlc.UpdateUserByEmailParams{
			PasswordHash: hash,
			DisplayName:  *displayName,
			ChurchName:   *churchName,
			Timezone:     *timezone,
			Email:        existing.Email,
		})
	} else {
		_, err = q.CreateUser(ctx, sqlc.CreateUserParams{
			Email:        *email,
			PasswordHash: hash,
			DisplayName:  *displayName,
			ChurchName:   *churchName,
			Timezone:     *timezone,
		})
	}
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("admin user %s ready\n", *email)
}
