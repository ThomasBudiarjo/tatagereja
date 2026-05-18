package keluarga

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
	NamaKeluarga string      `json:"nama_keluarga" validate:"required,min=1,max=200"`
	Alamat       null.String `json:"alamat" validate:"omitempty,max=500"`
	Catatan      null.String `json:"catatan" validate:"omitempty,max=2000"`
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID := appmw.GetUserID(r)
	limit, offset := httpx.ParsePagination(r)
	rows, err := h.q.ListKeluarga(r.Context(), sqlc.ListKeluargaParams{
		UserID: userID, Limit: limit, Offset: offset,
	})
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to list keluarga")
		return
	}
	total, err := h.q.CountKeluarga(r.Context(), userID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to count keluarga")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"data": rows, "total": total, "limit": limit, "offset": offset,
	})
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
	row, err := h.q.CreateKeluarga(r.Context(), sqlc.CreateKeluargaParams{
		UserID:       appmw.GetUserID(r),
		NamaKeluarga: req.NamaKeluarga,
		Alamat:       req.Alamat,
		Catatan:      req.Catatan,
	})
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to create keluarga")
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
	k, err := h.q.GetKeluarga(r.Context(), sqlc.GetKeluargaParams{ID: id, UserID: userID})
	if errors.Is(err, sql.ErrNoRows) {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "db error")
		return
	}
	members, err := h.q.ListJemaatByKeluarga(r.Context(), sqlc.ListJemaatByKeluargaParams{
		UserID:     userID,
		KeluargaID: null.IntFrom(id),
	})
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to list members")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"keluarga": k,
		"members":  members,
	})
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
	row, err := h.q.UpdateKeluarga(r.Context(), sqlc.UpdateKeluargaParams{
		ID:           id,
		UserID:       appmw.GetUserID(r),
		NamaKeluarga: req.NamaKeluarga,
		Alamat:       req.Alamat,
		Catatan:      req.Catatan,
	})
	if errors.Is(err, sql.ErrNoRows) {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to update keluarga")
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
	if _, err := h.q.GetKeluarga(r.Context(), sqlc.GetKeluargaParams{ID: id, UserID: userID}); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteError(w, http.StatusNotFound, "not found")
			return
		}
		httpx.WriteError(w, http.StatusInternalServerError, "db error")
		return
	}
	if err := h.q.DeleteKeluarga(r.Context(), sqlc.DeleteKeluargaParams{ID: id, UserID: userID}); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "delete failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
