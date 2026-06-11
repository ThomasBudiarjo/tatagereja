// Package service implements services (Ibadah) and volunteer role
// assignments (Pelayanan).
package service

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/thomasbudiarjo/tatagereja/internal/auth"
	"github.com/thomasbudiarjo/tatagereja/internal/db"
	"github.com/thomasbudiarjo/tatagereja/internal/httpx"
)

var validTypes = map[string]bool{
	"Sunday": true, "Youth": true, "Prayer": true, "Cell Group": true,
	"Christmas": true, "Easter": true, "Other": true,
}

var validRoles = map[string]bool{
	"Preacher": true, "Worship Leader": true, "Singer": true, "Musician": true,
	"Multimedia": true, "Usher": true, "Collector": true, "Prayer": true, "Other": true,
}

type Service struct {
	ID              string `json:"id"`
	Title           string `json:"title"`
	ServiceType     string `json:"service_type"`
	StartTime       string `json:"start_time"`
	EndTime         string `json:"end_time"`
	Location        string `json:"location"`
	Notes           string `json:"notes"`
	AttendanceCount int    `json:"attendance_count"`
	RoleCount       int    `json:"role_count"`
	CreatedAt       string `json:"created_at"`
	UpdatedAt       string `json:"updated_at"`
}

type Role struct {
	ID       string `json:"id"`
	RoleName string `json:"role_name"`
	MemberID string `json:"member_id"`
	FullName string `json:"full_name"`
	Notes    string `json:"notes"`
}

type input struct {
	Title       string `json:"title"`
	ServiceType string `json:"service_type"`
	StartTime   string `json:"start_time"`
	EndTime     string `json:"end_time"`
	Location    string `json:"location"`
	Notes       string `json:"notes"`
}

func (in *input) validate() string {
	in.Title = strings.TrimSpace(in.Title)
	if in.Title == "" {
		return "title is required"
	}
	if !validTypes[in.ServiceType] {
		return "service_type must be one of: Sunday, Youth, Prayer, Cell Group, Christmas, Easter, Other"
	}
	if in.StartTime == "" {
		return "start_time is required"
	}
	return ""
}

type Handler struct{ DB *sql.DB }

// List returns services ordered by start time, with role and attendance
// counts. Optional filters: ?from=, ?to= (compared against start_time).
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	query := `
		SELECT s.id, s.title, s.service_type, s.start_time, COALESCE(s.end_time,''),
		       COALESCE(s.location,''), COALESCE(s.notes,''),
		       (SELECT COUNT(*) FROM attendance a WHERE a.service_id = s.id),
		       (SELECT COUNT(*) FROM service_roles sr WHERE sr.service_id = s.id),
		       s.created_at, s.updated_at
		FROM services s
		WHERE s.church_id = ?`
	args := []any{auth.ChurchID(r)}
	if from := r.URL.Query().Get("from"); from != "" {
		query += ` AND s.start_time >= ?`
		args = append(args, from)
	}
	if to := r.URL.Query().Get("to"); to != "" {
		query += ` AND s.start_time <= ?`
		args = append(args, to)
	}
	query += ` ORDER BY s.start_time DESC`

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()
	services := []Service{}
	for rows.Next() {
		var s Service
		if err := rows.Scan(&s.ID, &s.Title, &s.ServiceType, &s.StartTime, &s.EndTime,
			&s.Location, &s.Notes, &s.AttendanceCount, &s.RoleCount, &s.CreatedAt, &s.UpdatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "database error")
			return
		}
		services = append(services, s)
	}
	httpx.JSON(w, http.StatusOK, services)
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
	if _, err := h.DB.Exec(`INSERT INTO services (id, church_id, title, service_type, start_time, end_time, location, notes, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, auth.ChurchID(r), in.Title, in.ServiceType, in.StartTime, in.EndTime, in.Location, in.Notes, now, now); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create service")
		return
	}
	h.getByID(w, r, id)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	h.getByID(w, r, chi.URLParam(r, "id"))
}

func (h *Handler) getByID(w http.ResponseWriter, r *http.Request, id string) {
	var s Service
	err := h.DB.QueryRow(`
		SELECT s.id, s.title, s.service_type, s.start_time, COALESCE(s.end_time,''),
		       COALESCE(s.location,''), COALESCE(s.notes,''),
		       (SELECT COUNT(*) FROM attendance a WHERE a.service_id = s.id),
		       (SELECT COUNT(*) FROM service_roles sr WHERE sr.service_id = s.id),
		       s.created_at, s.updated_at
		FROM services s WHERE s.id = ? AND s.church_id = ?`, id, auth.ChurchID(r)).
		Scan(&s.ID, &s.Title, &s.ServiceType, &s.StartTime, &s.EndTime,
			&s.Location, &s.Notes, &s.AttendanceCount, &s.RoleCount, &s.CreatedAt, &s.UpdatedAt)
	if err == sql.ErrNoRows {
		httpx.Error(w, http.StatusNotFound, "service not found")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	httpx.JSON(w, http.StatusOK, s)
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
	res, err := h.DB.Exec(`UPDATE services SET title = ?, service_type = ?, start_time = ?, end_time = ?, location = ?, notes = ?, updated_at = ?
		WHERE id = ? AND church_id = ?`,
		in.Title, in.ServiceType, in.StartTime, in.EndTime, in.Location, in.Notes, db.Now(), id, auth.ChurchID(r))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not update service")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		httpx.Error(w, http.StatusNotFound, "service not found")
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
	tx.Exec(`DELETE FROM service_roles WHERE service_id = ? AND service_id IN (SELECT id FROM services WHERE church_id = ?)`, id, churchID)
	tx.Exec(`DELETE FROM attendance WHERE service_id = ? AND service_id IN (SELECT id FROM services WHERE church_id = ?)`, id, churchID)
	res, err := tx.Exec(`DELETE FROM services WHERE id = ? AND church_id = ?`, id, churchID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not delete service")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		httpx.Error(w, http.StatusNotFound, "service not found")
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// serviceInChurch enforces the tenant boundary for nested routes.
func (h *Handler) serviceInChurch(serviceID, churchID string) bool {
	var n int
	if err := h.DB.QueryRow(`SELECT COUNT(*) FROM services WHERE id = ? AND church_id = ?`, serviceID, churchID).Scan(&n); err != nil {
		return false
	}
	return n > 0
}

func (h *Handler) ListRoles(w http.ResponseWriter, r *http.Request) {
	serviceID, churchID := chi.URLParam(r, "id"), auth.ChurchID(r)
	if !h.serviceInChurch(serviceID, churchID) {
		httpx.Error(w, http.StatusNotFound, "service not found")
		return
	}
	roles, err := h.rolesFor(serviceID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	httpx.JSON(w, http.StatusOK, roles)
}

func (h *Handler) rolesFor(serviceID string) ([]Role, error) {
	rows, err := h.DB.Query(`
		SELECT sr.id, sr.role_name, sr.member_id, m.full_name, COALESCE(sr.notes,'')
		FROM service_roles sr JOIN members m ON m.id = sr.member_id
		WHERE sr.service_id = ?
		ORDER BY sr.role_name, m.full_name COLLATE NOCASE`, serviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	roles := []Role{}
	for rows.Next() {
		var role Role
		if err := rows.Scan(&role.ID, &role.RoleName, &role.MemberID, &role.FullName, &role.Notes); err != nil {
			return nil, err
		}
		roles = append(roles, role)
	}
	return roles, nil
}

func (h *Handler) CreateRole(w http.ResponseWriter, r *http.Request) {
	serviceID, churchID := chi.URLParam(r, "id"), auth.ChurchID(r)
	var in struct {
		RoleName string `json:"role_name"`
		MemberID string `json:"member_id"`
		Notes    string `json:"notes"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !validRoles[in.RoleName] {
		httpx.Error(w, http.StatusBadRequest, "role_name must be one of: Preacher, Worship Leader, Singer, Musician, Multimedia, Usher, Collector, Prayer, Other")
		return
	}
	if !h.serviceInChurch(serviceID, churchID) {
		httpx.Error(w, http.StatusNotFound, "service not found")
		return
	}
	var n int
	if err := h.DB.QueryRow(`SELECT COUNT(*) FROM members WHERE id = ? AND church_id = ?`, in.MemberID, churchID).Scan(&n); err != nil || n == 0 {
		httpx.Error(w, http.StatusBadRequest, "member not found")
		return
	}
	now := db.Now()
	if _, err := h.DB.Exec(`INSERT INTO service_roles (id, service_id, role_name, member_id, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		db.NewID(), serviceID, in.RoleName, in.MemberID, in.Notes, now, now); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not assign role")
		return
	}
	roles, err := h.rolesFor(serviceID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	httpx.JSON(w, http.StatusCreated, roles)
}

func (h *Handler) DeleteRole(w http.ResponseWriter, r *http.Request) {
	serviceID, roleID := chi.URLParam(r, "id"), chi.URLParam(r, "roleID")
	res, err := h.DB.Exec(`DELETE FROM service_roles WHERE id = ? AND service_id = ?
		AND service_id IN (SELECT id FROM services WHERE church_id = ?)`,
		roleID, serviceID, auth.ChurchID(r))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not remove role")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		httpx.Error(w, http.StatusNotFound, "role not found")
		return
	}
	roles, err := h.rolesFor(serviceID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	httpx.JSON(w, http.StatusOK, roles)
}
