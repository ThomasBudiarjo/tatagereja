package health

import (
	"context"
	"database/sql"
	"net/http"
	"time"

	"github.com/tatagereja/tatagereja/backend/internal/httpx"
)

type Handler struct{ db *sql.DB }

func New(db *sql.DB) *Handler { return &Handler{db: db} }

func (h *Handler) Handle(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	dbStatus := "ok"
	status := http.StatusOK
	if err := h.db.PingContext(ctx); err != nil {
		dbStatus = "error"
		status = http.StatusServiceUnavailable
	}
	overall := "ok"
	if status != http.StatusOK {
		overall = "degraded"
	}
	httpx.WriteJSON(w, status, map[string]any{
		"status": overall,
		"db":     dbStatus,
	})
}
