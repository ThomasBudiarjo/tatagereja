package handlers

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-playground/validator/v10"

	"github.com/thomas/tatagereja/backend/internal/db/sqlc"
	appmw "github.com/thomas/tatagereja/backend/internal/middleware"
	"github.com/thomas/tatagereja/backend/internal/models"
)

type KebaktianHandler struct {
	db       *sql.DB
	q        *sqlc.Queries
	validate *validator.Validate
}

func NewKebaktianHandler(db *sql.DB) *KebaktianHandler {
	return &KebaktianHandler{db: db, q: sqlc.New(db), validate: validator.New()}
}

const dateLayout = "2006-01-02"

func (h *KebaktianHandler) List(w http.ResponseWriter, r *http.Request) {
	churchID := appmw.GetChurchID(r)
	limit, offset := parsePagination(r)
	ctx := r.Context()

	now := time.Now().UTC()
	from := now.AddDate(0, 0, -7).Format(dateLayout)
	to := now.AddDate(0, 6, 0).Format(dateLayout)
	if v := r.URL.Query().Get("from"); v != "" {
		if _, err := time.Parse(dateLayout, v); err == nil {
			from = v
		}
	}
	if v := r.URL.Query().Get("to"); v != "" {
		if _, err := time.Parse(dateLayout, v); err == nil {
			to = v
		}
	}

	rows, err := h.q.ListKebaktianByChurch(ctx, sqlc.ListKebaktianByChurchParams{
		ChurchID:  churchID,
		Tanggal:   from,
		Tanggal_2: to,
		Limit:     limit,
		Offset:    offset,
	})
	if err != nil {
		slog.Error("list kebaktian", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to list kebaktian")
		return
	}

	total, err := h.q.CountKebaktianByChurch(ctx, sqlc.CountKebaktianByChurchParams{
		ChurchID:  churchID,
		Tanggal:   from,
		Tanggal_2: to,
	})
	if err != nil {
		slog.Error("count kebaktian", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to count kebaktian")
		return
	}

	resp := make([]models.KebaktianResponse, 0, len(rows))
	for _, row := range rows {
		resp = append(resp, models.KebaktianFromRow(row))
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data":   resp,
		"total":  total,
		"limit":  limit,
		"offset": offset,
		"from":   from,
		"to":     to,
	})
}

func (h *KebaktianHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIDParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	churchID := appmw.GetChurchID(r)

	row, err := h.q.GetKebaktianByID(r.Context(), sqlc.GetKebaktianByIDParams{ID: id, ChurchID: churchID})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "kebaktian not found")
			return
		}
		slog.Error("get kebaktian", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	writeJSON(w, http.StatusOK, models.KebaktianFromRow(row))
}

func (h *KebaktianHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.CreateKebaktianRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := h.validate.Struct(&req); err != nil {
		writeValidationError(w, err)
		return
	}

	churchID := appmw.GetChurchID(r)
	row, err := h.q.CreateKebaktian(r.Context(), sqlc.CreateKebaktianParams{
		ChurchID:    churchID,
		Nama:        req.Nama,
		Tanggal:     req.Tanggal,
		WaktuMulai:  req.WaktuMulai,
		Lokasi:      req.Lokasi,
		Tema:        req.Tema,
		Pengkhotbah: req.Pengkhotbah,
		Catatan:     req.Catatan,
	})
	if err != nil {
		slog.Error("create kebaktian", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to create kebaktian")
		return
	}
	writeJSON(w, http.StatusCreated, models.KebaktianFromRow(row))
}

func (h *KebaktianHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIDParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}

	var req models.UpdateKebaktianRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := h.validate.Struct(&req); err != nil {
		writeValidationError(w, err)
		return
	}

	churchID := appmw.GetChurchID(r)
	row, err := h.q.UpdateKebaktian(r.Context(), sqlc.UpdateKebaktianParams{
		Nama:        req.Nama,
		Tanggal:     req.Tanggal,
		WaktuMulai:  req.WaktuMulai,
		Lokasi:      req.Lokasi,
		Tema:        req.Tema,
		Pengkhotbah: req.Pengkhotbah,
		Catatan:     req.Catatan,
		ID:          id,
		ChurchID:    churchID,
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "kebaktian not found")
			return
		}
		slog.Error("update kebaktian", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to update kebaktian")
		return
	}
	writeJSON(w, http.StatusOK, models.KebaktianFromRow(row))
}

func (h *KebaktianHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIDParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	churchID := appmw.GetChurchID(r)

	if _, err := h.q.GetKebaktianByID(r.Context(), sqlc.GetKebaktianByIDParams{ID: id, ChurchID: churchID}); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "kebaktian not found")
			return
		}
		slog.Error("get kebaktian before delete", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	if err := h.q.DeleteKebaktian(r.Context(), sqlc.DeleteKebaktianParams{ID: id, ChurchID: churchID}); err != nil {
		slog.Error("delete kebaktian", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to delete kebaktian")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *KebaktianHandler) GetJadwal(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIDParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	churchID := appmw.GetChurchID(r)
	ctx := r.Context()

	if _, err := h.q.GetKebaktianByID(ctx, sqlc.GetKebaktianByIDParams{ID: id, ChurchID: churchID}); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "kebaktian not found")
			return
		}
		slog.Error("get kebaktian for jadwal", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	rows, err := h.q.GetJadwalByKebaktian(ctx, sqlc.GetJadwalByKebaktianParams{
		KebaktianID: id,
		ChurchID:    churchID,
	})
	if err != nil {
		slog.Error("get jadwal", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	resp := make([]models.JadwalSlotResponse, 0, len(rows))
	for _, row := range rows {
		resp = append(resp, models.JadwalSlotResponse{
			ID:               row.ID,
			KebaktianID:      row.KebaktianID,
			ServiceTypeID:    row.ServiceTypeID,
			ServiceTypeName:  row.ServiceTypeName,
			ServiceTypeWarna: row.ServiceTypeWarna,
			PelayanID:        row.PelayanID,
			PelayanJemaatID:  row.JemaatID,
			PelayanNama:      row.PelayanNama,
			Catatan:          row.Catatan,
			Status:           row.Status,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data":         resp,
		"kebaktian_id": id,
	})
}

func (h *KebaktianHandler) UpdateJadwal(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIDParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}

	var req models.BulkUpsertJadwalRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := h.validate.Struct(&req); err != nil {
		writeValidationError(w, err)
		return
	}

	churchID := appmw.GetChurchID(r)
	ctx := r.Context()

	if _, err := h.q.GetKebaktianByID(ctx, sqlc.GetKebaktianByIDParams{ID: id, ChurchID: churchID}); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "kebaktian not found")
			return
		}
		slog.Error("get kebaktian for jadwal upsert", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	for _, slot := range req.Slots {
		if _, err := h.q.GetServiceTypeByID(ctx, sqlc.GetServiceTypeByIDParams{ID: slot.ServiceTypeID, ChurchID: churchID}); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeError(w, http.StatusBadRequest, "service type not found in this church")
				return
			}
			slog.Error("validate service type for slot", "err", err)
			writeError(w, http.StatusInternalServerError, "db error")
			return
		}
		if slot.PelayanID != nil {
			if _, err := h.q.GetPelayanByID(ctx, sqlc.GetPelayanByIDParams{ID: *slot.PelayanID, ChurchID: churchID}); err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					writeError(w, http.StatusBadRequest, "pelayan not found in this church")
					return
				}
				slog.Error("validate pelayan for slot", "err", err)
				writeError(w, http.StatusInternalServerError, "db error")
				return
			}
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

	if err := qtx.DeleteJadwalByKebaktian(ctx, sqlc.DeleteJadwalByKebaktianParams{
		KebaktianID: id,
		ChurchID:    churchID,
	}); err != nil {
		slog.Error("clear jadwal", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	for _, slot := range req.Slots {
		if _, err := qtx.CreateJadwalSlot(ctx, sqlc.CreateJadwalSlotParams{
			ChurchID:      churchID,
			KebaktianID:   id,
			ServiceTypeID: slot.ServiceTypeID,
			PelayanID:     slot.PelayanID,
			Catatan:       slot.Catatan,
		}); err != nil {
			slog.Error("create jadwal slot", "err", err)
			writeError(w, http.StatusInternalServerError, "db error")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		slog.Error("commit jadwal upsert", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	h.GetJadwal(w, r)
}
