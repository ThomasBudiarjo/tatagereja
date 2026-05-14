package handlers

import (
	"context"
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

type PelayanHandler struct {
	db       *sql.DB
	q        *sqlc.Queries
	validate *validator.Validate
}

func NewPelayanHandler(db *sql.DB) *PelayanHandler {
	return &PelayanHandler{db: db, q: sqlc.New(db), validate: validator.New()}
}

func (h *PelayanHandler) loadServiceTypes(ctx context.Context, pelayanID int64) ([]models.PelayanServiceTypeRef, error) {
	rows, err := h.q.GetServiceTypesForPelayan(ctx, pelayanID)
	if err != nil {
		return nil, err
	}
	out := make([]models.PelayanServiceTypeRef, 0, len(rows))
	for _, r := range rows {
		out = append(out, models.PelayanServiceTypeRef{
			ID:         r.ID,
			Nama:       r.Nama,
			Warna:      r.Warna,
			SkillLevel: r.SkillLevel,
		})
	}
	return out, nil
}

func (h *PelayanHandler) List(w http.ResponseWriter, r *http.Request) {
	churchID := appmw.GetChurchID(r)
	limit, offset := parsePagination(r)
	q := strings.TrimSpace(r.URL.Query().Get("q"))

	ctx := r.Context()

	type pelayanRow struct {
		ID            int64
		JemaatID      int64
		Catatan       *string
		IsActive      int64
		CreatedAt     string
		UpdatedAt     string
		NamaLengkap   string
		NamaPanggilan *string
	}

	var rows []pelayanRow
	var total int64

	if q != "" {
		like := "%" + q + "%"
		raw, err := h.q.SearchPelayan(ctx, sqlc.SearchPelayanParams{
			ChurchID:      churchID,
			NamaLengkap:   like,
			NamaPanggilan: &like,
			Limit:         limit,
			Offset:        offset,
		})
		if err != nil {
			slog.Error("search pelayan", "err", err)
			writeError(w, http.StatusInternalServerError, "failed to search pelayan")
			return
		}
		for _, p := range raw {
			rows = append(rows, pelayanRow{
				ID: p.ID, JemaatID: p.JemaatID, Catatan: p.Catatan, IsActive: p.IsActive,
				CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt,
				NamaLengkap: p.NamaLengkap, NamaPanggilan: p.NamaPanggilan,
			})
		}
		total = int64(len(rows))
	} else {
		raw, err := h.q.ListPelayanByChurch(ctx, sqlc.ListPelayanByChurchParams{
			ChurchID: churchID,
			Limit:    limit,
			Offset:   offset,
		})
		if err != nil {
			slog.Error("list pelayan", "err", err)
			writeError(w, http.StatusInternalServerError, "failed to list pelayan")
			return
		}
		for _, p := range raw {
			rows = append(rows, pelayanRow{
				ID: p.ID, JemaatID: p.JemaatID, Catatan: p.Catatan, IsActive: p.IsActive,
				CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt,
				NamaLengkap: p.NamaLengkap, NamaPanggilan: p.NamaPanggilan,
			})
		}
		total, err = h.q.CountPelayanByChurch(ctx, churchID)
		if err != nil {
			slog.Error("count pelayan", "err", err)
			writeError(w, http.StatusInternalServerError, "failed to count pelayan")
			return
		}
	}

	resp := make([]models.PelayanResponse, 0, len(rows))
	for _, p := range rows {
		sts, err := h.loadServiceTypes(ctx, p.ID)
		if err != nil {
			slog.Error("load service types for pelayan", "err", err, "pelayan_id", p.ID)
			writeError(w, http.StatusInternalServerError, "failed to hydrate pelayan")
			return
		}
		resp = append(resp, models.PelayanResponse{
			ID:            p.ID,
			ChurchID:      churchID,
			JemaatID:      p.JemaatID,
			NamaLengkap:   p.NamaLengkap,
			NamaPanggilan: p.NamaPanggilan,
			Catatan:       p.Catatan,
			IsActive:      p.IsActive == 1,
			ServiceTypes:  sts,
			CreatedAt:     p.CreatedAt,
			UpdatedAt:     p.UpdatedAt,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data":   resp,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (h *PelayanHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIDParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	churchID := appmw.GetChurchID(r)
	ctx := r.Context()

	row, err := h.q.GetPelayanByID(ctx, sqlc.GetPelayanByIDParams{ID: id, ChurchID: churchID})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "pelayan not found")
			return
		}
		slog.Error("get pelayan", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	sts, err := h.loadServiceTypes(ctx, row.ID)
	if err != nil {
		slog.Error("load pelayan service types", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	writeJSON(w, http.StatusOK, models.PelayanResponse{
		ID:            row.ID,
		ChurchID:      row.ChurchID,
		JemaatID:      row.JemaatID,
		NamaLengkap:   row.NamaLengkap,
		NamaPanggilan: row.NamaPanggilan,
		Catatan:       row.Catatan,
		IsActive:      row.IsActive == 1,
		ServiceTypes:  sts,
		CreatedAt:     row.CreatedAt,
		UpdatedAt:     row.UpdatedAt,
	})
}

func (h *PelayanHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.CreatePelayanRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := h.validate.Struct(&req); err != nil {
		writeValidationError(w, err)
		return
	}

	churchID := appmw.GetChurchID(r)
	ctx := r.Context()

	jemaat, err := h.q.GetJemaatByID(ctx, sqlc.GetJemaatByIDParams{ID: req.JemaatID, ChurchID: churchID})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusBadRequest, "jemaat not found in this church")
			return
		}
		slog.Error("get jemaat for pelayan create", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	for _, stID := range req.ServiceTypeIDs {
		if _, err := h.q.GetServiceTypeByID(ctx, sqlc.GetServiceTypeByIDParams{ID: stID, ChurchID: churchID}); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeError(w, http.StatusBadRequest, "service type not found in this church")
				return
			}
			slog.Error("validate service type", "err", err)
			writeError(w, http.StatusInternalServerError, "db error")
			return
		}
	}

	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		slog.Error("begin tx", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer func() { _ = tx.Rollback() }()

	qtx := h.q.WithTx(tx)
	pel, err := qtx.CreatePelayan(ctx, sqlc.CreatePelayanParams{
		ChurchID: churchID,
		JemaatID: req.JemaatID,
		Catatan:  req.Catatan,
	})
	if err != nil {
		slog.Error("create pelayan", "err", err)
		writeError(w, http.StatusConflict, "this jemaat is already a pelayan")
		return
	}
	for _, stID := range req.ServiceTypeIDs {
		if err := qtx.AddPelayanServiceType(ctx, sqlc.AddPelayanServiceTypeParams{
			PelayanID:     pel.ID,
			ServiceTypeID: stID,
		}); err != nil {
			slog.Error("add pelayan service type", "err", err)
			writeError(w, http.StatusInternalServerError, "failed to link service type")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		slog.Error("commit pelayan create", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	sts, err := h.loadServiceTypes(ctx, pel.ID)
	if err != nil {
		slog.Error("load pelayan sts after create", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	writeJSON(w, http.StatusCreated, models.PelayanResponse{
		ID:            pel.ID,
		ChurchID:      pel.ChurchID,
		JemaatID:      pel.JemaatID,
		NamaLengkap:   jemaat.NamaLengkap,
		NamaPanggilan: jemaat.NamaPanggilan,
		Catatan:       pel.Catatan,
		IsActive:      pel.IsActive == 1,
		ServiceTypes:  sts,
		CreatedAt:     pel.CreatedAt,
		UpdatedAt:     pel.UpdatedAt,
	})
}

func (h *PelayanHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIDParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}

	var req models.UpdatePelayanRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := h.validate.Struct(&req); err != nil {
		writeValidationError(w, err)
		return
	}

	churchID := appmw.GetChurchID(r)
	ctx := r.Context()

	existing, err := h.q.GetPelayanByID(ctx, sqlc.GetPelayanByIDParams{ID: id, ChurchID: churchID})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "pelayan not found")
			return
		}
		slog.Error("get pelayan for update", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	for _, stID := range req.ServiceTypeIDs {
		if _, err := h.q.GetServiceTypeByID(ctx, sqlc.GetServiceTypeByIDParams{ID: stID, ChurchID: churchID}); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeError(w, http.StatusBadRequest, "service type not found in this church")
				return
			}
			slog.Error("validate service type", "err", err)
			writeError(w, http.StatusInternalServerError, "db error")
			return
		}
	}

	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		slog.Error("begin tx", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer func() { _ = tx.Rollback() }()
	qtx := h.q.WithTx(tx)

	isActive := existing.IsActive
	if req.IsActive != nil {
		if *req.IsActive {
			isActive = 1
		} else {
			isActive = 0
		}
	}

	updated, err := qtx.UpdatePelayan(ctx, sqlc.UpdatePelayanParams{
		Catatan:  req.Catatan,
		IsActive: isActive,
		ID:       id,
		ChurchID: churchID,
	})
	if err != nil {
		slog.Error("update pelayan", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to update pelayan")
		return
	}

	if err := qtx.ClearPelayanServiceTypes(ctx, id); err != nil {
		slog.Error("clear service types", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	for _, stID := range req.ServiceTypeIDs {
		if err := qtx.AddPelayanServiceType(ctx, sqlc.AddPelayanServiceTypeParams{
			PelayanID:     id,
			ServiceTypeID: stID,
		}); err != nil {
			slog.Error("add pelayan service type", "err", err)
			writeError(w, http.StatusInternalServerError, "db error")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		slog.Error("commit pelayan update", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	sts, err := h.loadServiceTypes(ctx, id)
	if err != nil {
		slog.Error("load pelayan sts after update", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	writeJSON(w, http.StatusOK, models.PelayanResponse{
		ID:            updated.ID,
		ChurchID:      updated.ChurchID,
		JemaatID:      updated.JemaatID,
		NamaLengkap:   existing.NamaLengkap,
		NamaPanggilan: existing.NamaPanggilan,
		Catatan:       updated.Catatan,
		IsActive:      updated.IsActive == 1,
		ServiceTypes:  sts,
		CreatedAt:     updated.CreatedAt,
		UpdatedAt:     updated.UpdatedAt,
	})
}

func (h *PelayanHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIDParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	churchID := appmw.GetChurchID(r)
	ctx := r.Context()

	if _, err := h.q.GetPelayanByID(ctx, sqlc.GetPelayanByIDParams{ID: id, ChurchID: churchID}); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "pelayan not found")
			return
		}
		slog.Error("get pelayan before delete", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	if err := h.q.DeletePelayan(ctx, sqlc.DeletePelayanParams{ID: id, ChurchID: churchID}); err != nil {
		slog.Error("delete pelayan", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to delete pelayan")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
