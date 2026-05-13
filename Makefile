.PHONY: help setup dev dev-fe dev-be build test lint clean db-apply db-diff db-migrate sqlc seed

help:
	@echo "Shepherd dev commands:"
	@echo "  make setup        — install deps (run once)"
	@echo "  make dev          — run frontend + backend in parallel"
	@echo "  make dev-fe       — frontend only"
	@echo "  make dev-be       — backend only (with air hot reload)"
	@echo "  make build        — production build for both"
	@echo "  make test         — run all tests"
	@echo "  make lint         — lint all code"
	@echo "  make db-apply     — apply schema.sql to local dev DB (destructive)"
	@echo "  make db-diff name=desc — generate a versioned migration"
	@echo "  make db-migrate   — apply pending migrations"
	@echo "  make sqlc         — regenerate Go DB code from queries"
	@echo "  make seed         — seed dev DB with sample data"

setup:
	cd frontend && npm install
	cd backend && go mod download

dev:
	@echo "Starting frontend (5173) and backend (8080)..."
	@trap 'kill 0' EXIT; \
	(cd backend && air) & \
	(cd frontend && npm run dev) & \
	wait

dev-fe:
	cd frontend && npm run dev

dev-be:
	cd backend && air

build:
	cd frontend && npm run build
	cd backend && go build -o bin/server ./cmd/server

test:
	cd backend && go test ./...
	cd frontend && npm test -- --run

lint:
	cd backend && golangci-lint run
	cd frontend && npm run lint

clean:
	rm -rf frontend/dist backend/bin backend/tmp

# --- Database ---

db-apply:
	cd backend && atlas schema apply --env local --auto-approve

db-diff:
	@test -n "$(name)" || (echo "Usage: make db-diff name=description"; exit 1)
	cd backend && atlas migrate diff $(name) --env local

db-migrate:
	cd backend && atlas migrate apply --env local

sqlc:
	cd backend && sqlc generate

seed:
	cd backend && go run scripts/seed-dev.go

seed-admin:
	cd backend && go run scripts/seed-admin/main.go \
		--church-slug=$(slug) \
		--church-name="$(name)" \
		--email=$(email) \
		--password=$(password)
