package servicetypes

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"
	"gopkg.in/guregu/null.v4"

	"github.com/tatagereja/tatagereja/backend/internal/db/sqlc"
	"github.com/tatagereja/tatagereja/backend/internal/httpx"
	appmw "github.com/tatagereja/tatagereja/backend/internal/middleware"
)

type Handler struct {
	q        sqlc.Querier
	validate *validator.Validate
}

func NewHandler(q sqlc.Querier, _ *sql.DB) *Handler {
	return &Handler{q: q, validate: httpx.NewValidator()}
}

type writeRequest struct {
	Nama      string      `json:"nama" validate:"required,min=1,max=100"`
	Deskripsi null.String `json:"deskripsi" validate:"omitempty,max=500"`
	Urutan    int64       `json:"urutan"`
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.q.ListServiceTypes(r.Context(), appmw.GetUserID(r))
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to list service types")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"data": rows})
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req writeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := h.validate.Struct(&req); err != nil {
		httpx.WriteValidationError(w, err)
		return
	}
	row, err := h.q.CreateServiceType(r.Context(), sqlc.CreateServiceTypeParams{
		UserID:    appmw.GetUserID(r),
		Nama:      req.Nama,
		Deskripsi: req.Deskripsi,
		Urutan:    req.Urutan,
	})
	if err != nil {
		httpx.WriteError(w, http.StatusConflict, "name already exists or db error")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, row)
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req writeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := h.validate.Struct(&req); err != nil {
		httpx.WriteValidationError(w, err)
		return
	}
	row, err := h.q.UpdateServiceType(r.Context(), sqlc.UpdateServiceTypeParams{
		ID:        id,
		UserID:    appmw.GetUserID(r),
		Nama:      req.Nama,
		Deskripsi: req.Deskripsi,
		Urutan:    req.Urutan,
	})
	if errors.Is(err, sql.ErrNoRows) {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		httpx.WriteError(w, http.StatusConflict, "name already exists or db error")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, row)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	userID := appmw.GetUserID(r)
	if _, err := h.q.GetServiceType(r.Context(), sqlc.GetServiceTypeParams{ID: id, UserID: userID}); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteError(w, http.StatusNotFound, "not found")
			return
		}
		httpx.WriteError(w, http.StatusInternalServerError, "db error")
		return
	}
	count, err := h.q.CountJadwalForServiceType(r.Context(), sqlc.CountJadwalForServiceTypeParams{
		UserID: userID, ServiceTypeID: id,
	})
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "db error")
		return
	}
	if count > 0 {
		httpx.WriteError(w, http.StatusConflict, "service type is referenced by jadwal entries")
		return
	}
	if err := h.q.DeleteServiceType(r.Context(), sqlc.DeleteServiceTypeParams{ID: id, UserID: userID}); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "delete failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
