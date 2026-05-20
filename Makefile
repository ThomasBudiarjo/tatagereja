.PHONY: help setup dev build test lint sqlc seed-admin clean
help:
	@echo "setup | dev | build | test | lint | sqlc | seed-admin | clean"
setup:
	cd backend && go mod download
dev:
	cd backend && air
build:
	cd backend && go build -o bin/server ./cmd/server
test:
	cd backend && go test -race -cover ./...
lint:
	cd backend && golangci-lint run
sqlc:
	cd backend && sqlc generate
seed-admin:
	cd backend && go run ./cmd/seed-admin --email=admin@example.com --password=changeme --display-name="Admin" --church-name="GKI Demo"
clean:
	rm -rf backend/bin backend/tmp backend/data
