// Package church exposes church profile settings (Pengaturan Gereja).
package church

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/thomasbudiarjo/tatagereja/internal/auth"
	"github.com/thomasbudiarjo/tatagereja/internal/db"
	"github.com/thomasbudiarjo/tatagereja/internal/httpx"
)

type Church struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Slug      string `json:"slug"`
	Address   string `json:"address"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type Handler struct{ DB *sql.DB }

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	var c Church
	err := h.DB.QueryRow(`SELECT id, name, slug, COALESCE(address,''), created_at, updated_at FROM churches WHERE id = ?`, auth.ChurchID(r)).
		Scan(&c.ID, &c.Name, &c.Slug, &c.Address, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	httpx.JSON(w, http.StatusOK, c)
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r)
	if u.Role != "owner" && u.Role != "admin" {
		httpx.Error(w, http.StatusForbidden, "only owners and admins can update church settings")
		return
	}
	var in struct {
		Name    string `json:"name"`
		Address string `json:"address"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	if _, err := h.DB.Exec(`UPDATE churches SET name = ?, address = ?, updated_at = ? WHERE id = ?`,
		in.Name, in.Address, db.Now(), u.ChurchID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not update church")
		return
	}
	h.Get(w, r)
}
