// Package attendance records who attended a service (Kehadiran), including
// walk-in guests.
package attendance

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/thomasbudiarjo/tatagereja/internal/auth"
	"github.com/thomasbudiarjo/tatagereja/internal/db"
	"github.com/thomasbudiarjo/tatagereja/internal/httpx"
)

type Record struct {
	ID        string `json:"id"`
	MemberID  string `json:"member_id"`
	FullName  string `json:"full_name"`
	IsGuest   bool   `json:"is_guest"`
	GuestName string `json:"guest_name"`
}

type Handler struct{ DB *sql.DB }

func (h *Handler) serviceInChurch(serviceID, churchID string) bool {
	var n int
	if err := h.DB.QueryRow(`SELECT COUNT(*) FROM services WHERE id = ? AND church_id = ?`, serviceID, churchID).Scan(&n); err != nil {
		return false
	}
	return n > 0
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	serviceID := chi.URLParam(r, "id")
	if !h.serviceInChurch(serviceID, auth.ChurchID(r)) {
		httpx.Error(w, http.StatusNotFound, "service not found")
		return
	}
	records, err := h.recordsFor(serviceID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	httpx.JSON(w, http.StatusOK, records)
}

func (h *Handler) recordsFor(serviceID string) ([]Record, error) {
	rows, err := h.DB.Query(`
		SELECT a.id, COALESCE(a.member_id,''), COALESCE(m.full_name,''), a.is_guest, COALESCE(a.guest_name,'')
		FROM attendance a LEFT JOIN members m ON m.id = a.member_id
		WHERE a.service_id = ?
		ORDER BY a.is_guest, COALESCE(m.full_name, a.guest_name) COLLATE NOCASE`, serviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := []Record{}
	for rows.Next() {
		var rec Record
		if err := rows.Scan(&rec.ID, &rec.MemberID, &rec.FullName, &rec.IsGuest, &rec.GuestName); err != nil {
			return nil, err
		}
		records = append(records, rec)
	}
	return records, nil
}

// Save replaces the full attendance list for a service: the checked member
// IDs plus manually entered guest names.
func (h *Handler) Save(w http.ResponseWriter, r *http.Request) {
	serviceID, churchID := chi.URLParam(r, "id"), auth.ChurchID(r)
	var in struct {
		MemberIDs []string `json:"member_ids"`
		Guests    []string `json:"guests"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !h.serviceInChurch(serviceID, churchID) {
		httpx.Error(w, http.StatusNotFound, "service not found")
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM attendance WHERE service_id = ?`, serviceID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not save attendance")
		return
	}
	now := db.Now()
	seen := map[string]bool{}
	for _, memberID := range in.MemberIDs {
		if seen[memberID] {
			continue
		}
		seen[memberID] = true
		// Re-check tenant scope per member so foreign IDs can't be attached.
		var n int
		if err := tx.QueryRow(`SELECT COUNT(*) FROM members WHERE id = ? AND church_id = ?`, memberID, churchID).Scan(&n); err != nil || n == 0 {
			httpx.Error(w, http.StatusBadRequest, "member not found: "+memberID)
			return
		}
		if _, err := tx.Exec(`INSERT INTO attendance (id, service_id, member_id, is_guest, guest_name, created_at) VALUES (?, ?, ?, 0, NULL, ?)`,
			db.NewID(), serviceID, memberID, now); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not save attendance")
			return
		}
	}
	for _, guest := range in.Guests {
		guest = strings.TrimSpace(guest)
		if guest == "" {
			continue
		}
		if _, err := tx.Exec(`INSERT INTO attendance (id, service_id, member_id, is_guest, guest_name, created_at) VALUES (?, ?, NULL, 1, ?, ?)`,
			db.NewID(), serviceID, guest, now); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not save attendance")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}

	records, err := h.recordsFor(serviceID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	httpx.JSON(w, http.StatusOK, records)
}
