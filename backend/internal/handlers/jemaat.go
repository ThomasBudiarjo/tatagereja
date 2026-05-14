package handlers

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-playground/validator/v10"

	"github.com/thomas/tatagereja/backend/internal/db/sqlc"
	appmw "github.com/thomas/tatagereja/backend/internal/middleware"
	"github.com/thomas/tatagereja/backend/internal/models"
)

type JemaatHandler struct {
	db       *sql.DB
	q        *sqlc.Queries
	validate *validator.Validate
}

func NewJemaatHandler(db *sql.DB) *JemaatHandler {
	return &JemaatHandler{db: db, q: sqlc.New(db), validate: validator.New()}
}

func (h *JemaatHandler) List(w http.ResponseWriter, r *http.Request) {
	churchID := appmw.GetChurchID(r)
	limit, offset := parsePagination(r)
	q := strings.TrimSpace(r.URL.Query().Get("q"))

	ctx := r.Context()

	var (
		rows  []sqlc.Jemaat
		total int64
		err   error
	)

	if q != "" {
		like := "%" + q + "%"
		rows, err = h.q.SearchJemaat(ctx, sqlc.SearchJemaatParams{
			ChurchID:      churchID,
			NamaLengkap:   like,
			NamaPanggilan: &like,
			Email:         &like,
			Limit:         limit,
			Offset:        offset,
		})
		if err != nil {
			slog.Error("search jemaat", "err", err)
			writeError(w, http.StatusInternalServerError, "failed to search jemaat")
			return
		}
		total = int64(len(rows))
	} else {
		rows, err = h.q.ListJemaatByChurch(ctx, sqlc.ListJemaatByChurchParams{
			ChurchID: churchID,
			Limit:    limit,
			Offset:   offset,
		})
		if err != nil {
			slog.Error("list jemaat", "err", err)
			writeError(w, http.StatusInternalServerError, "failed to list jemaat")
			return
		}
		total, err = h.q.CountJemaatByChurch(ctx, churchID)
		if err != nil {
			slog.Error("count jemaat", "err", err)
			writeError(w, http.StatusInternalServerError, "failed to count jemaat")
			return
		}
	}

	resp := make([]models.JemaatResponse, 0, len(rows))
	for _, row := range rows {
		resp = append(resp, models.JemaatFromRow(row))
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data":   resp,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (h *JemaatHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIDParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	churchID := appmw.GetChurchID(r)

	row, err := h.q.GetJemaatByID(r.Context(), sqlc.GetJemaatByIDParams{
		ID:       id,
		ChurchID: churchID,
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "jemaat not found")
			return
		}
		slog.Error("get jemaat", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to get jemaat")
		return
	}
	writeJSON(w, http.StatusOK, models.JemaatFromRow(row))
}

func (h *JemaatHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.CreateJemaatRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := h.validate.Struct(&req); err != nil {
		writeValidationError(w, err)
		return
	}

	churchID := appmw.GetChurchID(r)
	row, err := h.q.CreateJemaat(r.Context(), sqlc.CreateJemaatParams{
		ChurchID:         churchID,
		NamaLengkap:      req.NamaLengkap,
		NamaPanggilan:    req.NamaPanggilan,
		JenisKelamin:     req.JenisKelamin,
		TanggalLahir:     req.TanggalLahir,
		TempatLahir:      req.TempatLahir,
		Alamat:           req.Alamat,
		NomorTelepon:     req.NomorTelepon,
		Email:            req.Email,
		StatusPernikahan: req.StatusPernikahan,
		TanggalBaptis:    req.TanggalBaptis,
		TanggalSidi:      req.TanggalSidi,
		KeluargaID:       req.KeluargaID,
		Catatan:          req.Catatan,
	})
	if err != nil {
		slog.Error("create jemaat", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to create jemaat")
		return
	}
	writeJSON(w, http.StatusCreated, models.JemaatFromRow(row))
}

func (h *JemaatHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIDParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}

	var req models.UpdateJemaatRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := h.validate.Struct(&req); err != nil {
		writeValidationError(w, err)
		return
	}

	churchID := appmw.GetChurchID(r)
	row, err := h.q.UpdateJemaat(r.Context(), sqlc.UpdateJemaatParams{
		NamaLengkap:      req.NamaLengkap,
		NamaPanggilan:    req.NamaPanggilan,
		JenisKelamin:     req.JenisKelamin,
		TanggalLahir:     req.TanggalLahir,
		TempatLahir:      req.TempatLahir,
		Alamat:           req.Alamat,
		NomorTelepon:     req.NomorTelepon,
		Email:            req.Email,
		StatusPernikahan: req.StatusPernikahan,
		TanggalBaptis:    req.TanggalBaptis,
		TanggalSidi:      req.TanggalSidi,
		KeluargaID:       req.KeluargaID,
		Catatan:          req.Catatan,
		ID:               id,
		ChurchID:         churchID,
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "jemaat not found")
			return
		}
		slog.Error("update jemaat", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to update jemaat")
		return
	}
	writeJSON(w, http.StatusOK, models.JemaatFromRow(row))
}

func (h *JemaatHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIDParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	churchID := appmw.GetChurchID(r)

	if _, err := h.q.GetJemaatByID(r.Context(), sqlc.GetJemaatByIDParams{ID: id, ChurchID: churchID}); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "jemaat not found")
			return
		}
		slog.Error("get jemaat before delete", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	if err := h.q.DeactivateJemaat(r.Context(), sqlc.DeactivateJemaatParams{ID: id, ChurchID: churchID}); err != nil {
		slog.Error("deactivate jemaat", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to delete jemaat")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
