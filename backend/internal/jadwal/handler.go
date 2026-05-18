package jadwal

import (
	"context"
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
	db       *sql.DB
	validate *validator.Validate
}

func NewHandler(q sqlc.Querier, db *sql.DB) *Handler {
	return &Handler{q: q, db: db, validate: validator.New()}
}

type slotRequest struct {
	ServiceTypeID int64       `json:"service_type_id" validate:"required,gt=0"`
	PelayanID     null.Int    `json:"pelayan_id"`
	Catatan       null.String `json:"catatan" validate:"omitempty,max=500"`
}

type replaceRequest struct {
	Slots []slotRequest `json:"slots" validate:"required,dive"`
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	kebaktianID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	userID := appmw.GetUserID(r)
	if _, err := h.q.GetKebaktian(r.Context(), sqlc.GetKebaktianParams{ID: kebaktianID, UserID: userID}); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteError(w, http.StatusNotFound, "not found")
			return
		}
		httpx.WriteError(w, http.StatusInternalServerError, "db error")
		return
	}
	rows, err := h.q.ListJadwalForKebaktian(r.Context(), sqlc.ListJadwalForKebaktianParams{
		UserID: userID, KebaktianID: kebaktianID,
	})
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to list jadwal")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"data": rows})
}

func (h *Handler) Replace(w http.ResponseWriter, r *http.Request) {
	kebaktianID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	userID := appmw.GetUserID(r)

	var req replaceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := h.validate.Struct(&req); err != nil {
		httpx.WriteValidationError(w, err)
		return
	}
	// ensure unique service_type_id within request
	seen := map[int64]bool{}
	for _, s := range req.Slots {
		if seen[s.ServiceTypeID] {
			httpx.WriteError(w, http.StatusBadRequest, "duplicate service_type_id in slots")
			return
		}
		seen[s.ServiceTypeID] = true
	}

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "tx begin")
		return
	}
	defer tx.Rollback()
	qtx := sqlc.New(tx)

	if _, err := qtx.GetKebaktian(r.Context(), sqlc.GetKebaktianParams{ID: kebaktianID, UserID: userID}); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteError(w, http.StatusNotFound, "not found")
			return
		}
		httpx.WriteError(w, http.StatusInternalServerError, "db error")
		return
	}

	if err := validateSlotRefs(r.Context(), qtx, userID, req.Slots); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := qtx.DeleteJadwalForKebaktian(r.Context(), sqlc.DeleteJadwalForKebaktianParams{
		KebaktianID: kebaktianID, UserID: userID,
	}); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "delete failed")
		return
	}
	for _, s := range req.Slots {
		if _, err := qtx.CreateJadwal(r.Context(), sqlc.CreateJadwalParams{
			UserID:        userID,
			KebaktianID:   kebaktianID,
			ServiceTypeID: s.ServiceTypeID,
			PelayanID:     s.PelayanID,
			Catatan:       s.Catatan,
		}); err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "insert failed")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "commit failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func validateSlotRefs(ctx context.Context, q sqlc.Querier, userID int64, slots []slotRequest) error {
	for _, s := range slots {
		if _, err := q.GetServiceType(ctx, sqlc.GetServiceTypeParams{ID: s.ServiceTypeID, UserID: userID}); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return errors.New("service_type_id does not exist")
			}
			return err
		}
		if s.PelayanID.Valid {
			if _, err := q.GetPelayan(ctx, sqlc.GetPelayanParams{ID: s.PelayanID.Int64, UserID: userID}); err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					return errors.New("pelayan_id does not exist")
				}
				return err
			}
		}
	}
	return nil
}
