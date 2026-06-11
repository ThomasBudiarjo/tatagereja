// Package member implements CRUD for church members (Jemaat).
package member

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/thomasbudiarjo/tatagereja/internal/auth"
	"github.com/thomasbudiarjo/tatagereja/internal/db"
	"github.com/thomasbudiarjo/tatagereja/internal/httpx"
)

var validStatuses = map[string]bool{
	"active": true, "inactive": true, "moved": true, "deceased": true, "guest": true,
}

type Member struct {
	ID        string `json:"id"`
	FullName  string `json:"full_name"`
	Phone     string `json:"phone"`
	Email     string `json:"email"`
	Address   string `json:"address"`
	BirthDate string `json:"birth_date"`
	Gender    string `json:"gender"`
	Status    string `json:"status"`
	Notes     string `json:"notes"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type input struct {
	FullName  string `json:"full_name"`
	Phone     string `json:"phone"`
	Email     string `json:"email"`
	Address   string `json:"address"`
	BirthDate string `json:"birth_date"`
	Gender    string `json:"gender"`
	Status    string `json:"status"`
	Notes     string `json:"notes"`
}

func (in *input) validate() string {
	in.FullName = strings.TrimSpace(in.FullName)
	if in.FullName == "" {
		return "full_name is required"
	}
	if in.Status == "" {
		in.Status = "active"
	}
	if !validStatuses[in.Status] {
		return "status must be one of: active, inactive, moved, deceased, guest"
	}
	return ""
}

type Handler struct{ DB *sql.DB }

const selectCols = `id, full_name, COALESCE(phone,''), COALESCE(email,''), COALESCE(address,''),
	COALESCE(birth_date,''), COALESCE(gender,''), status, COALESCE(notes,''), created_at, updated_at`

func scan(row interface{ Scan(...any) error }) (Member, error) {
	var m Member
	err := row.Scan(&m.ID, &m.FullName, &m.Phone, &m.Email, &m.Address,
		&m.BirthDate, &m.Gender, &m.Status, &m.Notes, &m.CreatedAt, &m.UpdatedAt)
	return m, err
}

// List supports optional ?q= (name search) and ?status= filters.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	churchID := auth.ChurchID(r)
	query := `SELECT ` + selectCols + ` FROM members WHERE church_id = ?`
	args := []any{churchID}
	if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
		query += ` AND full_name LIKE ?`
		args = append(args, "%"+q+"%")
	}
	if s := r.URL.Query().Get("status"); s != "" {
		query += ` AND status = ?`
		args = append(args, s)
	}
	query += ` ORDER BY full_name COLLATE NOCASE`

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()
	members := []Member{}
	for rows.Next() {
		m, err := scan(rows)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "database error")
			return
		}
		members = append(members, m)
	}
	httpx.JSON(w, http.StatusOK, members)
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var in input
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if msg := in.validate(); msg != "" {
		httpx.Error(w, http.StatusBadRequest, msg)
		return
	}
	id, now := db.NewID(), db.Now()
	_, err := h.DB.Exec(`INSERT INTO members (id, church_id, full_name, phone, email, address, birth_date, gender, status, notes, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, auth.ChurchID(r), in.FullName, in.Phone, in.Email, in.Address, in.BirthDate, in.Gender, in.Status, in.Notes, now, now)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create member")
		return
	}
	h.getByID(w, r, id)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	h.getByID(w, r, chi.URLParam(r, "id"))
}

func (h *Handler) getByID(w http.ResponseWriter, r *http.Request, id string) {
	m, err := scan(h.DB.QueryRow(`SELECT `+selectCols+` FROM members WHERE id = ? AND church_id = ?`, id, auth.ChurchID(r)))
	if err == sql.ErrNoRows {
		httpx.Error(w, http.StatusNotFound, "member not found")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	httpx.JSON(w, http.StatusOK, m)
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in input
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if msg := in.validate(); msg != "" {
		httpx.Error(w, http.StatusBadRequest, msg)
		return
	}
	res, err := h.DB.Exec(`UPDATE members SET full_name = ?, phone = ?, email = ?, address = ?, birth_date = ?, gender = ?, status = ?, notes = ?, updated_at = ?
		WHERE id = ? AND church_id = ?`,
		in.FullName, in.Phone, in.Email, in.Address, in.BirthDate, in.Gender, in.Status, in.Notes, db.Now(), id, auth.ChurchID(r))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not update member")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		httpx.Error(w, http.StatusNotFound, "member not found")
		return
	}
	h.getByID(w, r, id)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id, churchID := chi.URLParam(r, "id"), auth.ChurchID(r)
	tx, err := h.DB.Begin()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	defer tx.Rollback()
	// Detach references before deleting the row itself.
	tx.Exec(`DELETE FROM family_members WHERE member_id = ? AND family_id IN (SELECT id FROM families WHERE church_id = ?)`, id, churchID)
	tx.Exec(`UPDATE families SET head_member_id = NULL WHERE head_member_id = ? AND church_id = ?`, id, churchID)
	tx.Exec(`DELETE FROM service_roles WHERE member_id = ? AND service_id IN (SELECT id FROM services WHERE church_id = ?)`, id, churchID)
	tx.Exec(`DELETE FROM attendance WHERE member_id = ? AND service_id IN (SELECT id FROM services WHERE church_id = ?)`, id, churchID)
	res, err := tx.Exec(`DELETE FROM members WHERE id = ? AND church_id = ?`, id, churchID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not delete member")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		httpx.Error(w, http.StatusNotFound, "member not found")
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}
