package config

import (
	"log"
	"os"
)

type Config struct {
	Port         string
	AppEnv       string
	DatabasePath string
	LogLevel     string
	CookieSecure bool

	ReplicaBucket          string
	ReplicaPath            string
	ReplicaEndpoint        string
	ReplicaAccessKeyID     string
	ReplicaSecretAccessKey string
}

// ReplicaConfigured returns true when all required replica fields are set.
func (c Config) ReplicaConfigured() bool {
	return c.ReplicaBucket != "" &&
		c.ReplicaAccessKeyID != "" &&
		c.ReplicaSecretAccessKey != ""
}

func Load() (Config, error) {
	dbPath := os.Getenv("DATABASE_PATH")
	if dbPath == "" {
		dbPath = "tatagereja.db"
	}
	env := os.Getenv("APP_ENV")
	if env == "" {
		env = "development"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	replicaPath := os.Getenv("REPLICA_PATH")
	if replicaPath == "" {
		replicaPath = "tatagereja"
	}
	return Config{
		Port:         port,
		AppEnv:       env,
		DatabasePath: dbPath,
		LogLevel:     os.Getenv("LOG_LEVEL"),
		CookieSecure: env == "production",

		ReplicaBucket:          os.Getenv("REPLICA_BUCKET"),
		ReplicaPath:            replicaPath,
		ReplicaEndpoint:        os.Getenv("REPLICA_ENDPOINT"),
		ReplicaAccessKeyID:     os.Getenv("REPLICA_ACCESS_KEY_ID"),
		ReplicaSecretAccessKey: os.Getenv("REPLICA_SECRET_ACCESS_KEY"),
	}, nil
}

func MustLoad() Config {
	cfg, err := Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	return cfg
}
