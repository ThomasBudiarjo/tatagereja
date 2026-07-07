package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/thomasbudiarjo/tatagereja/internal/scheduling"
)

// serviceHandlers serves the /api/services and roster assignment endpoints.
type serviceHandlers struct {
	scheduling *scheduling.Service
}

type assignmentJSON struct {
	ID         string `json:"id"`
	PersonID   string `json:"personId"`
	PersonName string `json:"personName"`
	RoleCode   string `json:"roleCode"`
	RoleName   string `json:"roleName"`
}

type serviceJSON struct {
	ID                string           `json:"id"`
	PelayananTypeCode string           `json:"pelayananTypeCode"`
	PelayananTypeName string           `json:"pelayananTypeName"`
	Date              string           `json:"date"`
	StartTime         string           `json:"startTime"`
	Title             string           `json:"title"`
	Notes             string           `json:"notes"`
	Assignments       []assignmentJSON `json:"assignments"`
}

func assignmentResponse(a scheduling.Assignment) assignmentJSON {
	return assignmentJSON{
		ID: a.ID, PersonID: a.PersonID, PersonName: a.PersonName,
		RoleCode: a.RoleCode, RoleName: a.RoleName,
	}
}

func serviceResponse(s scheduling.ServiceWithAssignments) serviceJSON {
	assignments := make([]assignmentJSON, 0, len(s.Assignments))
	for _, a := range s.Assignments {
		assignments = append(assignments, assignmentResponse(a))
	}
	return serviceJSON{
		ID:                s.Service.ID,
		PelayananTypeCode: s.Service.PelayananTypeCode,
		PelayananTypeName: s.PelayananTypeName,
		Date:              s.Service.ServiceDate,
		StartTime:         s.Service.StartTime,
		Title:             s.Service.Title,
		Notes:             s.Service.Notes,
		Assignments:       assignments,
	}
}

// writeSchedulingError maps scheduling sentinel errors to HTTP responses.
func writeSchedulingError(w http.ResponseWriter, err error, fallback string) {
	switch {
	case errors.Is(err, scheduling.ErrNotFound):
		writeError(w, http.StatusNotFound, "not found")
	case errors.Is(err, scheduling.ErrValidation), errors.Is(err, scheduling.ErrUnknownRef):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, scheduling.ErrDuplicateAssignment):
		writeError(w, http.StatusConflict, "jemaat sudah ditugaskan pada peran ini")
	default:
		writeError(w, http.StatusInternalServerError, fallback)
	}
}

type serviceRequest struct {
	PelayananTypeCode string `json:"pelayananTypeCode"`
	Date              string `json:"date"`
	StartTime         string `json:"startTime"`
	Title             string `json:"title"`
	Notes             string `json:"notes"`
}

func (req serviceRequest) input() scheduling.ServiceInput {
	return scheduling.ServiceInput{
		PelayananTypeCode: req.PelayananTypeCode,
		Date:              req.Date,
		StartTime:         req.StartTime,
		Title:             req.Title,
		Notes:             req.Notes,
	}
}

func (h *serviceHandlers) list(w http.ResponseWriter, r *http.Request) {
	from := r.URL.Query().Get("from")
	to := r.URL.Query().Get("to")
	if !validDate(from) || !validDate(to) || from > to {
		writeError(w, http.StatusBadRequest, "from dan to harus tanggal YYYY-MM-DD yang valid")
		return
	}
	services, err := h.scheduling.ListServicesWithAssignments(r.Context(), from, to)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list services")
		return
	}
	out := make([]serviceJSON, 0, len(services))
	for _, s := range services {
		out = append(out, serviceResponse(s))
	}
	writeJSON(w, http.StatusOK, out)
}

func validDate(s string) bool {
	_, err := time.Parse("2006-01-02", s)
	return err == nil
}

func (h *serviceHandlers) create(w http.ResponseWriter, r *http.Request) {
	var req serviceRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	created, err := h.scheduling.CreateService(r.Context(), req.input())
	if err != nil {
		writeSchedulingError(w, err, "could not create service")
		return
	}
	full, err := h.scheduling.GetServiceWithAssignments(r.Context(), created.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load service")
		return
	}
	writeJSON(w, http.StatusCreated, serviceResponse(full))
}

func (h *serviceHandlers) get(w http.ResponseWriter, r *http.Request) {
	full, err := h.scheduling.GetServiceWithAssignments(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeSchedulingError(w, err, "could not load service")
		return
	}
	writeJSON(w, http.StatusOK, serviceResponse(full))
}

func (h *serviceHandlers) update(w http.ResponseWriter, r *http.Request) {
	var req serviceRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	id := chi.URLParam(r, "id")
	if _, err := h.scheduling.UpdateService(r.Context(), id, req.input()); err != nil {
		writeSchedulingError(w, err, "could not update service")
		return
	}
	full, err := h.scheduling.GetServiceWithAssignments(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load service")
		return
	}
	writeJSON(w, http.StatusOK, serviceResponse(full))
}

func (h *serviceHandlers) delete(w http.ResponseWriter, r *http.Request) {
	if err := h.scheduling.DeleteService(r.Context(), chi.URLParam(r, "id")); err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete service")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type assignRequest struct {
	PersonID string `json:"personId"`
	RoleCode string `json:"roleCode"`
}

type assignResponse struct {
	Assignment assignmentJSON `json:"assignment"`
	Warnings   []string       `json:"warnings"`
}

func (h *serviceHandlers) assign(w http.ResponseWriter, r *http.Request) {
	var req assignRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.PersonID == "" || req.RoleCode == "" {
		writeError(w, http.StatusBadRequest, "jemaat dan peran wajib diisi")
		return
	}
	assignment, warnings, err := h.scheduling.Assign(r.Context(), chi.URLParam(r, "id"), req.PersonID, req.RoleCode)
	if err != nil {
		writeSchedulingError(w, err, "could not assign")
		return
	}
	writeJSON(w, http.StatusCreated, assignResponse{
		Assignment: assignmentResponse(assignment),
		Warnings:   warnings,
	})
}

func (h *serviceHandlers) unassign(w http.ResponseWriter, r *http.Request) {
	err := h.scheduling.Unassign(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "assignmentId"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not remove assignment")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
