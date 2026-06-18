// Package config loads and validates process configuration from environment
// variables. Litestream/R2/Turnstile values are read but not yet acted on in
// this milestone.
package config

import (
	"errors"
	"os"
)

// R2Config holds Cloudflare R2 credentials for Litestream (deferred).
type R2Config struct {
	AccessKeyID     string
	SecretAccessKey string
	Bucket          string
	Endpoint        string
	ReplicaPath     string
}

// LitestreamConfig holds replication tuning (deferred).
type LitestreamConfig struct {
	SyncInterval string
	CUDDebounce  string
}

// Config is the validated process configuration.
type Config struct {
	AppEnv          string
	Port            string
	DatabasePath    string
	SessionSecret   []byte
	R2              R2Config
	Litestream      LitestreamConfig
	TurnstileSecret string
}

// IsProduction reports whether the process runs in the production environment.
func (c Config) IsProduction() bool { return c.AppEnv == "production" }

// IsDevelopment reports whether the process runs in development (the default).
func (c Config) IsDevelopment() bool { return c.AppEnv == "development" || c.AppEnv == "" }

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// devSessionSecret is used only in development when SESSION_SECRET is unset.
const devSessionSecret = "dev-insecure-session-secret-change-me-please"

// Load reads configuration from the environment and validates it. Outside
// development, SESSION_SECRET is required and must be at least 32 bytes.
func Load() (Config, error) {
	c := Config{
		AppEnv:          env("APP_ENV", "development"),
		Port:            env("PORT", "7356"),
		DatabasePath:    env("DATABASE_PATH", "./data/app.db"),
		TurnstileSecret: os.Getenv("TURNSTILE_SECRET_KEY"),
		R2: R2Config{
			AccessKeyID:     os.Getenv("R2_ACCESS_KEY_ID"),
			SecretAccessKey: os.Getenv("R2_SECRET_ACCESS_KEY"),
			Bucket:          os.Getenv("R2_BUCKET"),
			Endpoint:        os.Getenv("R2_ENDPOINT"),
			ReplicaPath:     os.Getenv("R2_REPLICA_PATH"),
		},
		Litestream: LitestreamConfig{
			SyncInterval: env("LITESTREAM_SYNC_INTERVAL", "10m"),
			CUDDebounce:  env("LITESTREAM_CUD_DEBOUNCE", "3s"),
		},
	}

	secret := os.Getenv("SESSION_SECRET")
	if c.IsDevelopment() {
		if secret == "" {
			secret = devSessionSecret
		}
	} else {
		if secret == "" {
			return Config{}, errors.New("SESSION_SECRET is required outside development")
		}
		if len(secret) < 32 {
			return Config{}, errors.New("SESSION_SECRET must be at least 32 bytes")
		}
	}
	c.SessionSecret = []byte(secret)
	return c, nil
}
