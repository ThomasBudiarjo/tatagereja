package http

import (
	"database/sql"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/thomasbudiarjo/tatagereja/internal/db"
	"github.com/thomasbudiarjo/tatagereja/internal/db/gen"
)

var roleCodeRe = regexp.MustCompile(`^[a-z0-9_]{1,40}$`)

// roleHandlers serves the serving-role and pelayanan-type reference endpoints.
type roleHandlers struct {
	store *db.Store
}

type pelayananTypeJSON struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

type roleJSON struct {
	Code      string `json:"code"`
	Name      string `json:"name"`
	SortOrder int64  `json:"sortOrder"`
}

func roleResponse(r gen.ServingRole) roleJSON {
	return roleJSON{Code: r.Code, Name: r.Name, SortOrder: r.SortOrder}
}

func (h *roleHandlers) listPelayananTypes(w http.ResponseWriter, r *http.Request) {
	types, err := h.store.ListPelayananTypes(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list pelayanan types")
		return
	}
	out := make([]pelayananTypeJSON, 0, len(types))
	for _, t := range types {
		out = append(out, pelayananTypeJSON{Code: t.Code, Name: t.Name})
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *roleHandlers) list(w http.ResponseWriter, r *http.Request) {
	roles, err := h.store.ListServingRoles(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list roles")
		return
	}
	out := make([]roleJSON, 0, len(roles))
	for _, role := range roles {
		out = append(out, roleResponse(role))
	}
	writeJSON(w, http.StatusOK, out)
}

type createRoleRequest struct {
	Code      string `json:"code"`
	Name      string `json:"name"`
	SortOrder int64  `json:"sortOrder"`
}

func (h *roleHandlers) create(w http.ResponseWriter, r *http.Request) {
	var req createRoleRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if !roleCodeRe.MatchString(req.Code) {
		writeError(w, http.StatusBadRequest, "kode harus huruf kecil, angka, atau garis bawah")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "nama wajib diisi")
		return
	}

	var role gen.ServingRole
	err := h.store.Tx(r.Context(), func(q *gen.Queries) error {
		created, err := q.CreateServingRole(r.Context(), gen.CreateServingRoleParams{
			Code: req.Code, Name: req.Name, SortOrder: req.SortOrder,
		})
		role = created
		return err
	})
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			writeError(w, http.StatusConflict, "kode peran sudah dipakai")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not create role")
		return
	}
	writeJSON(w, http.StatusCreated, roleResponse(role))
}

type updateRoleRequest struct {
	Name      string `json:"name"`
	SortOrder int64  `json:"sortOrder"`
}

func (h *roleHandlers) update(w http.ResponseWriter, r *http.Request) {
	var req updateRoleRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "nama wajib diisi")
		return
	}

	var role gen.ServingRole
	err := h.store.Tx(r.Context(), func(q *gen.Queries) error {
		updated, err := q.UpdateServingRole(r.Context(), gen.UpdateServingRoleParams{
			Name: req.Name, SortOrder: req.SortOrder, Code: chi.URLParam(r, "code"),
		})
		role = updated
		return err
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not update role")
		return
	}
	writeJSON(w, http.StatusOK, roleResponse(role))
}

func (h *roleHandlers) delete(w http.ResponseWriter, r *http.Request) {
	err := h.store.Tx(r.Context(), func(q *gen.Queries) error {
		return q.DeleteServingRole(r.Context(), chi.URLParam(r, "code"))
	})
	if err != nil {
		if strings.Contains(err.Error(), "FOREIGN KEY constraint failed") {
			writeError(w, http.StatusConflict, "peran masih dipakai dalam jadwal")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not delete role")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
