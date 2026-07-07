package http

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/thomasbudiarjo/tatagereja/internal/db"
	"github.com/thomasbudiarjo/tatagereja/internal/db/gen"
)

// personHandlers serves the /api/persons CRUD endpoints.
type personHandlers struct {
	store *db.Store
}

type personJSON struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Phone string `json:"phone"`
	Notes string `json:"notes"`
}

func personResponse(p gen.Person) personJSON {
	return personJSON{ID: p.ID, Name: p.Name, Phone: p.Phone, Notes: p.Notes}
}

type personRequest struct {
	Name  string `json:"name"`
	Phone string `json:"phone"`
	Notes string `json:"notes"`
}

func (req *personRequest) validate(w http.ResponseWriter) bool {
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "nama wajib diisi")
		return false
	}
	return true
}

func (h *personHandlers) list(w http.ResponseWriter, r *http.Request) {
	persons, err := h.store.ListPersons(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list persons")
		return
	}
	out := make([]personJSON, 0, len(persons))
	for _, p := range persons {
		out = append(out, personResponse(p))
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *personHandlers) create(w http.ResponseWriter, r *http.Request) {
	var req personRequest
	if !decodeJSON(w, r, &req) || !req.validate(w) {
		return
	}
	var person gen.Person
	err := h.store.Tx(r.Context(), func(q *gen.Queries) error {
		p, err := q.CreatePerson(r.Context(), gen.CreatePersonParams{
			ID: db.NewID(), Name: req.Name, Phone: req.Phone, Notes: req.Notes,
		})
		person = p
		return err
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create person")
		return
	}
	writeJSON(w, http.StatusCreated, personResponse(person))
}

func (h *personHandlers) get(w http.ResponseWriter, r *http.Request) {
	person, err := h.store.GetPerson(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not load person")
		return
	}
	writeJSON(w, http.StatusOK, personResponse(person))
}

func (h *personHandlers) update(w http.ResponseWriter, r *http.Request) {
	var req personRequest
	if !decodeJSON(w, r, &req) || !req.validate(w) {
		return
	}
	var person gen.Person
	err := h.store.Tx(r.Context(), func(q *gen.Queries) error {
		p, err := q.UpdatePerson(r.Context(), gen.UpdatePersonParams{
			Name: req.Name, Phone: req.Phone, Notes: req.Notes, ID: chi.URLParam(r, "id"),
		})
		person = p
		return err
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not update person")
		return
	}
	writeJSON(w, http.StatusOK, personResponse(person))
}

func (h *personHandlers) delete(w http.ResponseWriter, r *http.Request) {
	err := h.store.Tx(r.Context(), func(q *gen.Queries) error {
		return q.DeletePerson(r.Context(), chi.URLParam(r, "id"))
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete person")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
