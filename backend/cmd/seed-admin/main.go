package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"strings"

	"golang.org/x/term"

	"github.com/tatagereja/tatagereja/backend/internal/auth"
	"github.com/tatagereja/tatagereja/backend/internal/config"
	"github.com/tatagereja/tatagereja/backend/internal/db"
	"github.com/tatagereja/tatagereja/backend/internal/db/sqlc"
)

func main() {
	email := flag.String("email", "", "user email")
	password := flag.String("password", "", "password (prompt if empty)")
	displayName := flag.String("display-name", "", "display name")
	churchName := flag.String("church-name", "", "church name")
	timezone := flag.String("timezone", "Asia/Jakarta", "IANA timezone")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, "config:", err)
		os.Exit(1)
	}

	reader := bufio.NewReader(os.Stdin)
	if *email == "" {
		*email = prompt(reader, "Email: ")
	}
	if *displayName == "" {
		*displayName = prompt(reader, "Display name: ")
	}
	if *churchName == "" {
		*churchName = prompt(reader, "Church name: ")
	}
	if *timezone == "" {
		*timezone = "Asia/Jakarta"
	}
	if *password == "" {
		*password = promptPassword("Password: ")
		confirm := promptPassword("Confirm password: ")
		if *password != confirm {
			fmt.Fprintln(os.Stderr, "passwords do not match")
			os.Exit(1)
		}
	}

	if *email == "" || *password == "" || *displayName == "" || *churchName == "" {
		fmt.Fprintln(os.Stderr, "email, password, display-name, church-name are required")
		os.Exit(1)
	}

	database, err := db.Open(cfg.DatabaseURL)
	if err != nil {
		fmt.Fprintln(os.Stderr, "open db:", err)
		os.Exit(1)
	}
	defer database.Close()

	if err := db.Apply(database); err != nil {
		fmt.Fprintln(os.Stderr, "apply schema:", err)
		os.Exit(1)
	}

	q := sqlc.New(database)
	hash, err := auth.HashPassword(*password)
	if err != nil {
		fmt.Fprintln(os.Stderr, "hash password:", err)
		os.Exit(1)
	}

	user, err := q.CreateUser(context.Background(), sqlc.CreateUserParams{
		Email:        *email,
		PasswordHash: hash,
		DisplayName:  *displayName,
		ChurchName:   *churchName,
		Timezone:     *timezone,
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, "create user:", err)
		os.Exit(1)
	}

	slog.Info("user created", "id", user.ID, "email", user.Email)
	fmt.Printf("Created user id=%d email=%s\n", user.ID, user.Email)
}

func prompt(r *bufio.Reader, label string) string {
	fmt.Print(label)
	line, _ := r.ReadString('\n')
	return strings.TrimSpace(line)
}

func promptPassword(label string) string {
	fmt.Print(label)
	if !term.IsTerminal(int(os.Stdin.Fd())) {
		r := bufio.NewReader(os.Stdin)
		line, _ := r.ReadString('\n')
		return strings.TrimSpace(line)
	}
	b, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Println()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}
