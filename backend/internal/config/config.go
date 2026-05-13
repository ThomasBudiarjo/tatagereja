package config

import (
	"errors"
	"os"
	"strings"
)

type Config struct {
	Port               string
	Env                string
	DatabaseURL        string
	JWTSecret          []byte
	JWTIssuer          string
	JWTAudience        string
	CORSAllowedOrigins []string
	LogLevel           string
}

func Load() (*Config, error) {
	cfg := &Config{
		Port:        getEnv("PORT", "8080"),
		Env:         getEnv("APP_ENV", "development"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		JWTIssuer:   getEnv("JWT_ISSUER", "shepherd"),
		JWTAudience: getEnv("JWT_AUDIENCE", "shepherd-web"),
		LogLevel:    getEnv("LOG_LEVEL", "info"),
	}

	secret := os.Getenv("JWT_SECRET")
	if cfg.Env != "development" && len(secret) < 32 {
		return nil, errors.New("JWT_SECRET must be at least 32 bytes")
	}
	if secret == "" {
		secret = "change-me-to-32-bytes-of-randomness-please" // dev fallback
	}
	cfg.JWTSecret = []byte(secret)

	if cfg.DatabaseURL == "" {
		cfg.DatabaseURL = "file:./local.db"
	}

	origins := getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
	cfg.CORSAllowedOrigins = strings.Split(origins, ",")
	for i := range cfg.CORSAllowedOrigins {
		cfg.CORSAllowedOrigins[i] = strings.TrimSpace(cfg.CORSAllowedOrigins[i])
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
