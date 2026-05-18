package pelayan

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

type createRequest struct {
	JemaatID       int64       `json:"jemaat_id" validate:"required,gt=0"`
	Catatan        null.String `json:"catatan" validate:"omitempty,max=2000"`
	ServiceTypeIDs []int64     `json:"service_type_ids" validate:"omitempty,dive,gt=0"`
}

type updateRequest struct {
	Catatan        null.String `json:"catatan" validate:"omitempty,max=2000"`
	ServiceTypeIDs []int64     `json:"service_type_ids" validate:"omitempty,dive,gt=0"`
}

type pelayanResponse struct {
	ID             int64       `json:"id"`
	UserID         int64       `json:"user_id"`
	JemaatID       int64       `json:"jemaat_id"`
	NamaLengkap    string      `json:"nama_lengkap"`
	NamaPanggilan  null.String `json:"nama_panggilan"`
	Catatan        null.String `json:"catatan"`
	ServiceTypeIDs []int64     `json:"service_type_ids"`
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID := appmw.GetUserID(r)
	limit, offset := httpx.ParsePagination(r)
	rows, err := h.q.ListPelayan(r.Context(), sqlc.ListPelayanParams{
		UserID: userID, Limit: limit, Offset: offset,
	})
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to list pelayan")
		return
	}
	total, err := h.q.CountPelayan(r.Context(), userID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to count pelayan")
		return
	}
	out := make([]pelayanResponse, 0, len(rows))
	for _, row := range rows {
		stIDs, err := h.serviceTypeIDsFor(r.Context(), row.ID, userID)
		if err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "failed to load service types")
			return
		}
		out = append(out, pelayanResponse{
			ID:             row.ID,
			UserID:         row.UserID,
			JemaatID:       row.JemaatID,
			NamaLengkap:    row.NamaLengkap,
			NamaPanggilan:  row.NamaPanggilan,
			Catatan:        row.Catatan,
			ServiceTypeIDs: stIDs,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"data": out, "total": total, "limit": limit, "offset": offset,
	})
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req createRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := h.validate.Struct(&req); err != nil {
		httpx.WriteValidationError(w, err)
		return
	}
	userID := appmw.GetUserID(r)

	if _, err := h.q.GetJemaat(r.Context(), sqlc.GetJemaatParams{ID: req.JemaatID, UserID: userID}); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteError(w, http.StatusBadRequest, "jemaat_id does not exist")
			return
		}
		httpx.WriteError(w, http.StatusInternalServerError, "db error")
		return
	}
	if err := h.validateServiceTypeIDs(r.Context(), userID, req.ServiceTypeIDs); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "tx begin")
		return
	}
	defer tx.Rollback()
	qtx := sqlc.New(tx)

	row, err := qtx.CreatePelayan(r.Context(), sqlc.CreatePelayanParams{
		UserID:   userID,
		JemaatID: req.JemaatID,
		Catatan:  req.Catatan,
	})
	if err != nil {
		httpx.WriteError(w, http.StatusConflict, "jemaat is already a pelayan or db error")
		return
	}
	for _, stID := range req.ServiceTypeIDs {
		if err := qtx.AddPelayanServiceType(r.Context(), sqlc.AddPelayanServiceTypeParams{
			PelayanID:     row.ID,
			ServiceTypeID: stID,
		}); err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "failed to assign service type")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "commit failed")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, row)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	userID := appmw.GetUserID(r)
	p, err := h.q.GetPelayan(r.Context(), sqlc.GetPelayanParams{ID: id, UserID: userID})
	if errors.Is(err, sql.ErrNoRows) {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "db error")
		return
	}
	sts, err := h.q.ListPelayanServiceTypes(r.Context(), sqlc.ListPelayanServiceTypesParams{
		PelayanID: p.ID, UserID: userID,
	})
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to load service types")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"pelayan":       p,
		"service_types": sts,
	})
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req updateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := h.validate.Struct(&req); err != nil {
		httpx.WriteValidationError(w, err)
		return
	}
	userID := appmw.GetUserID(r)
	if err := h.validateServiceTypeIDs(r.Context(), userID, req.ServiceTypeIDs); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "tx begin")
		return
	}
	defer tx.Rollback()
	qtx := sqlc.New(tx)

	row, err := qtx.UpdatePelayan(r.Context(), sqlc.UpdatePelayanParams{
		ID: id, UserID: userID, Catatan: req.Catatan,
	})
	if errors.Is(err, sql.ErrNoRows) {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "update failed")
		return
	}
	if err := qtx.DeletePelayanServiceTypes(r.Context(), row.ID); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to clear service types")
		return
	}
	for _, stID := range req.ServiceTypeIDs {
		if err := qtx.AddPelayanServiceType(r.Context(), sqlc.AddPelayanServiceTypeParams{
			PelayanID: row.ID, ServiceTypeID: stID,
		}); err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "failed to assign service type")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "commit failed")
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
	if _, err := h.q.GetPelayan(r.Context(), sqlc.GetPelayanParams{ID: id, UserID: userID}); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteError(w, http.StatusNotFound, "not found")
			return
		}
		httpx.WriteError(w, http.StatusInternalServerError, "db error")
		return
	}
	if err := h.q.DeletePelayan(r.Context(), sqlc.DeletePelayanParams{ID: id, UserID: userID}); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "delete failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) validateServiceTypeIDs(ctx context.Context, userID int64, ids []int64) error {
	seen := map[int64]bool{}
	for _, id := range ids {
		if seen[id] {
			return errors.New("duplicate service_type_id")
		}
		seen[id] = true
		if _, err := h.q.GetServiceType(ctx, sqlc.GetServiceTypeParams{ID: id, UserID: userID}); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return errors.New("service_type_id does not exist")
			}
			return err
		}
	}
	return nil
}

func (h *Handler) serviceTypeIDsFor(ctx context.Context, pelayanID, userID int64) ([]int64, error) {
	sts, err := h.q.ListPelayanServiceTypes(ctx, sqlc.ListPelayanServiceTypesParams{
		PelayanID: pelayanID, UserID: userID,
	})
	if err != nil {
		return nil, err
	}
	ids := make([]int64, 0, len(sts))
	for _, st := range sts {
		ids = append(ids, st.ID)
	}
	return ids, nil
}
