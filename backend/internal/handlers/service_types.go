package handlers

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-playground/validator/v10"

	"github.com/thomas/tatagereja/backend/internal/db/sqlc"
	appmw "github.com/thomas/tatagereja/backend/internal/middleware"
	"github.com/thomas/tatagereja/backend/internal/models"
)

type ServiceTypeHandler struct {
	db       *sql.DB
	q        *sqlc.Queries
	validate *validator.Validate
}

func NewServiceTypeHandler(db *sql.DB) *ServiceTypeHandler {
	return &ServiceTypeHandler{db: db, q: sqlc.New(db), validate: validator.New()}
}

func (h *ServiceTypeHandler) List(w http.ResponseWriter, r *http.Request) {
	churchID := appmw.GetChurchID(r)

	rows, err := h.q.ListServiceTypesByChurch(r.Context(), churchID)
	if err != nil {
		slog.Error("list service types", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to list service types")
		return
	}

	resp := make([]models.ServiceTypeResponse, 0, len(rows))
	for _, row := range rows {
		resp = append(resp, models.ServiceTypeFromRow(row))
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data":   resp,
		"total":  int64(len(resp)),
		"limit":  int64(len(resp)),
		"offset": int64(0),
	})
}

func (h *ServiceTypeHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.CreateServiceTypeRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := h.validate.Struct(&req); err != nil {
		writeValidationError(w, err)
		return
	}

	churchID := appmw.GetChurchID(r)
	row, err := h.q.CreateServiceType(r.Context(), sqlc.CreateServiceTypeParams{
		ChurchID:  churchID,
		Nama:      req.Nama,
		Deskripsi: req.Deskripsi,
		Warna:     req.Warna,
		Urutan:    req.Urutan,
	})
	if err != nil {
		slog.Error("create service type", "err", err)
		writeError(w, http.StatusConflict, "service type with this name may already exist")
		return
	}
	writeJSON(w, http.StatusCreated, models.ServiceTypeFromRow(row))
}

func (h *ServiceTypeHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIDParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}

	var req models.UpdateServiceTypeRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := h.validate.Struct(&req); err != nil {
		writeValidationError(w, err)
		return
	}

	churchID := appmw.GetChurchID(r)
	row, err := h.q.UpdateServiceType(r.Context(), sqlc.UpdateServiceTypeParams{
		Nama:      req.Nama,
		Deskripsi: req.Deskripsi,
		Warna:     req.Warna,
		Urutan:    req.Urutan,
		ID:        id,
		ChurchID:  churchID,
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "service type not found")
			return
		}
		slog.Error("update service type", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to update service type")
		return
	}
	writeJSON(w, http.StatusOK, models.ServiceTypeFromRow(row))
}

func (h *ServiceTypeHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIDParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	churchID := appmw.GetChurchID(r)

	if _, err := h.q.GetServiceTypeByID(r.Context(), sqlc.GetServiceTypeByIDParams{ID: id, ChurchID: churchID}); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "service type not found")
			return
		}
		slog.Error("get service type before delete", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	count, err := h.q.CountJadwalByServiceType(r.Context(), sqlc.CountJadwalByServiceTypeParams{
		ServiceTypeID: id,
		ChurchID:      churchID,
	})
	if err != nil {
		slog.Error("count jadwal refs", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	if count > 0 {
		writeError(w, http.StatusConflict, "service type is referenced by existing jadwal")
		return
	}

	if err := h.q.DeleteServiceType(r.Context(), sqlc.DeleteServiceTypeParams{ID: id, ChurchID: churchID}); err != nil {
		slog.Error("delete service type", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to delete service type")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
