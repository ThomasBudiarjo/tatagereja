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

type KeluargaHandler struct {
	db       *sql.DB
	q        *sqlc.Queries
	validate *validator.Validate
}

func NewKeluargaHandler(db *sql.DB) *KeluargaHandler {
	return &KeluargaHandler{db: db, q: sqlc.New(db), validate: validator.New()}
}

func (h *KeluargaHandler) List(w http.ResponseWriter, r *http.Request) {
	churchID := appmw.GetChurchID(r)
	limit, offset := parsePagination(r)
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	ctx := r.Context()

	var (
		rows  []sqlc.Keluarga
		total int64
		err   error
	)

	if q != "" {
		like := "%" + q + "%"
		rows, err = h.q.SearchKeluarga(ctx, sqlc.SearchKeluargaParams{
			ChurchID:     churchID,
			NamaKeluarga: like,
			Alamat:       &like,
			Limit:        limit,
			Offset:       offset,
		})
		if err != nil {
			slog.Error("search keluarga", "err", err)
			writeError(w, http.StatusInternalServerError, "failed to search keluarga")
			return
		}
		total = int64(len(rows))
	} else {
		rows, err = h.q.ListKeluargaByChurch(ctx, sqlc.ListKeluargaByChurchParams{
			ChurchID: churchID,
			Limit:    limit,
			Offset:   offset,
		})
		if err != nil {
			slog.Error("list keluarga", "err", err)
			writeError(w, http.StatusInternalServerError, "failed to list keluarga")
			return
		}
		total, err = h.q.CountKeluargaByChurch(ctx, churchID)
		if err != nil {
			slog.Error("count keluarga", "err", err)
			writeError(w, http.StatusInternalServerError, "failed to count keluarga")
			return
		}
	}

	resp := make([]models.KeluargaResponse, 0, len(rows))
	for _, row := range rows {
		resp = append(resp, models.KeluargaFromRow(row))
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data":   resp,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (h *KeluargaHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIDParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	churchID := appmw.GetChurchID(r)
	ctx := r.Context()

	row, err := h.q.GetKeluargaByID(ctx, sqlc.GetKeluargaByIDParams{
		ID:       id,
		ChurchID: churchID,
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "keluarga not found")
			return
		}
		slog.Error("get keluarga", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	members, err := h.q.ListJemaatByKeluarga(ctx, sqlc.ListJemaatByKeluargaParams{
		KeluargaID: &id,
		ChurchID:   churchID,
	})
	if err != nil {
		slog.Error("list keluarga members", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	memberResp := make([]models.KeluargaMember, 0, len(members))
	for _, m := range members {
		memberResp = append(memberResp, models.KeluargaMember{
			ID:            m.ID,
			NamaLengkap:   m.NamaLengkap,
			NamaPanggilan: m.NamaPanggilan,
		})
	}

	writeJSON(w, http.StatusOK, models.KeluargaDetailResponse{
		KeluargaResponse: models.KeluargaFromRow(row),
		Members:          memberResp,
	})
}

func (h *KeluargaHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.CreateKeluargaRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := h.validate.Struct(&req); err != nil {
		writeValidationError(w, err)
		return
	}

	churchID := appmw.GetChurchID(r)
	row, err := h.q.CreateKeluarga(r.Context(), sqlc.CreateKeluargaParams{
		ChurchID:     churchID,
		NamaKeluarga: req.NamaKeluarga,
		Alamat:       req.Alamat,
		Catatan:      req.Catatan,
	})
	if err != nil {
		slog.Error("create keluarga", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to create keluarga")
		return
	}
	writeJSON(w, http.StatusCreated, models.KeluargaFromRow(row))
}

func (h *KeluargaHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIDParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}

	var req models.UpdateKeluargaRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := h.validate.Struct(&req); err != nil {
		writeValidationError(w, err)
		return
	}

	churchID := appmw.GetChurchID(r)
	row, err := h.q.UpdateKeluarga(r.Context(), sqlc.UpdateKeluargaParams{
		NamaKeluarga: req.NamaKeluarga,
		Alamat:       req.Alamat,
		Catatan:      req.Catatan,
		ID:           id,
		ChurchID:     churchID,
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "keluarga not found")
			return
		}
		slog.Error("update keluarga", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to update keluarga")
		return
	}
	writeJSON(w, http.StatusOK, models.KeluargaFromRow(row))
}

func (h *KeluargaHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIDParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	churchID := appmw.GetChurchID(r)

	if _, err := h.q.GetKeluargaByID(r.Context(), sqlc.GetKeluargaByIDParams{ID: id, ChurchID: churchID}); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "keluarga not found")
			return
		}
		slog.Error("get keluarga before delete", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	if err := h.q.DeleteKeluarga(r.Context(), sqlc.DeleteKeluargaParams{ID: id, ChurchID: churchID}); err != nil {
		slog.Error("delete keluarga", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to delete keluarga")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
