package kebaktian

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
	Nama        string      `json:"nama" validate:"required,min=1,max=200"`
	WaktuMulai  string      `json:"waktu_mulai" validate:"required,datetime=2006-01-02T15:04:05Z"`
	Lokasi      null.String `json:"lokasi" validate:"omitempty,max=200"`
	Tema        null.String `json:"tema" validate:"omitempty,max=300"`
	Pengkhotbah null.String `json:"pengkhotbah" validate:"omitempty,max=200"`
	Catatan     null.String `json:"catatan" validate:"omitempty,max=2000"`
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID := appmw.GetUserID(r)
	from := r.URL.Query().Get("from")
	to := r.URL.Query().Get("to")
	if from != "" && to != "" {
		rows, err := h.q.ListKebaktianInRange(r.Context(), sqlc.ListKebaktianInRangeParams{
			UserID:      userID,
			WaktuMulai:  from,
			WaktuMulai_2: to,
		})
		if err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "failed to list kebaktian")
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"data": rows})
		return
	}
	limit, offset := httpx.ParsePagination(r)
	rows, err := h.q.ListKebaktian(r.Context(), sqlc.ListKebaktianParams{
		UserID: userID, Limit: limit, Offset: offset,
	})
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to list kebaktian")
		return
	}
	total, err := h.q.CountKebaktian(r.Context(), userID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to count kebaktian")
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
	row, err := h.q.CreateKebaktian(r.Context(), sqlc.CreateKebaktianParams{
		UserID:      appmw.GetUserID(r),
		Nama:        req.Nama,
		WaktuMulai:  req.WaktuMulai,
		Lokasi:      req.Lokasi,
		Tema:        req.Tema,
		Pengkhotbah: req.Pengkhotbah,
		Catatan:     req.Catatan,
	})
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to create kebaktian")
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
	row, err := h.q.GetKebaktian(r.Context(), sqlc.GetKebaktianParams{
		ID: id, UserID: appmw.GetUserID(r),
	})
	if errors.Is(err, sql.ErrNoRows) {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "db error")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, row)
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
	row, err := h.q.UpdateKebaktian(r.Context(), sqlc.UpdateKebaktianParams{
		ID:          id,
		UserID:      appmw.GetUserID(r),
		Nama:        req.Nama,
		WaktuMulai:  req.WaktuMulai,
		Lokasi:      req.Lokasi,
		Tema:        req.Tema,
		Pengkhotbah: req.Pengkhotbah,
		Catatan:     req.Catatan,
	})
	if errors.Is(err, sql.ErrNoRows) {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to update kebaktian")
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
	if _, err := h.q.GetKebaktian(r.Context(), sqlc.GetKebaktianParams{ID: id, UserID: userID}); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteError(w, http.StatusNotFound, "not found")
			return
		}
		httpx.WriteError(w, http.StatusInternalServerError, "db error")
		return
	}
	if err := h.q.DeleteKebaktian(r.Context(), sqlc.DeleteKebaktianParams{ID: id, UserID: userID}); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "delete failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
