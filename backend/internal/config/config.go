package config

import (
	"fmt"
	"log"
	"os"
)

type Config struct {
	Port         string
	AppEnv       string
	DatabaseURL  string
	LogLevel     string
	CookieSecure bool
}

func Load() (Config, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	env := os.Getenv("APP_ENV")
	if env == "" {
		env = "development"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	return Config{
		Port:         port,
		AppEnv:       env,
		DatabaseURL:  dbURL,
		LogLevel:     os.Getenv("LOG_LEVEL"),
		CookieSecure: env == "production",
	}, nil
}

func MustLoad() Config {
	cfg, err := Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	return cfg
}
