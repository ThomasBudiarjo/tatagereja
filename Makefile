.PHONY: help setup setup-tools dev dev-fe dev-be build test lint clean sqlc seed-admin tidy

help:
	@echo "Tata Gereja dev commands:"
	@echo "  make setup        — install deps (run once)"
	@echo "  make setup-tools  — install Go dev tools (sqlc, air)"
	@echo "  make dev          — run frontend + backend in parallel"
	@echo "  make dev-fe       — frontend only"
	@echo "  make dev-be       — backend only (with air hot reload)"
	@echo "  make build        — production build"
	@echo "  make test         — run all tests"
	@echo "  make lint         — lint all code"
	@echo "  make sqlc         — regenerate Go DB code"
	@echo "  make seed-admin   — interactive user creation"
	@echo "  make clean        — remove build artifacts + local DB"

setup-tools:
	go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
	go install github.com/air-verse/air@latest

setup: setup-tools
	cd frontend && npm install
	cd backend && go mod download
	@test -f backend/.env || cp backend/.env.example backend/.env
	@test -f frontend/.env || cp frontend/.env.example frontend/.env
	@echo ""
	@echo "Setup complete. Next:"
	@echo "  make seed-admin"
	@echo "  make dev"

tidy:
	cd backend && go mod tidy

dev:
	@echo "Starting backend (:8787) and frontend (:5173)..."
	@trap 'kill 0' INT TERM EXIT; \
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
	cd backend && go build -o bin/seed-admin ./cmd/seed-admin

test:
	cd backend && go test -race -cover ./...
	cd frontend && npm test -- --run

lint:
	cd backend && go vet ./...
	cd frontend && npm run check

clean:
	rm -rf frontend/dist backend/bin backend/tmp backend/local.db backend/local.db-shm backend/local.db-wal

sqlc:
	cd backend && sqlc generate

seed-admin:
	cd backend && go run ./cmd/seed-admin
