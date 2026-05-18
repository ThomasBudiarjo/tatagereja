package jemaat

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

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
	return &Handler{q: q, validate: validator.New()}
}

type writeRequest struct {
	NamaLengkap      string      `json:"nama_lengkap" validate:"required,min=1,max=200"`
	NamaPanggilan    null.String `json:"nama_panggilan" validate:"omitempty,max=100"`
	JenisKelamin     null.String `json:"jenis_kelamin" validate:"omitempty,oneof=L P"`
	TanggalLahir     null.String `json:"tanggal_lahir" validate:"omitempty,datetime=2006-01-02"`
	TempatLahir      null.String `json:"tempat_lahir" validate:"omitempty,max=100"`
	Alamat           null.String `json:"alamat" validate:"omitempty,max=500"`
	NomorTelepon     null.String `json:"nomor_telepon" validate:"omitempty,max=30"`
	Email            null.String `json:"email" validate:"omitempty,email,max=200"`
	StatusPernikahan null.String `json:"status_pernikahan" validate:"omitempty,oneof=belum_menikah menikah cerai duda janda"`
	TanggalBaptis    null.String `json:"tanggal_baptis" validate:"omitempty,datetime=2006-01-02"`
	TanggalSidi      null.String `json:"tanggal_sidi" validate:"omitempty,datetime=2006-01-02"`
	KeluargaID       null.Int    `json:"keluarga_id"`
	Catatan          null.String `json:"catatan" validate:"omitempty,max=2000"`
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID := appmw.GetUserID(r)
	limit, offset := httpx.ParsePagination(r)
	query := r.URL.Query().Get("q")

	var rows []sqlc.Jemaat
	var total int64
	var err error
	if query == "" {
		rows, err = h.q.ListJemaat(r.Context(), sqlc.ListJemaatParams{
			UserID: userID, Limit: limit, Offset: offset,
		})
		if err == nil {
			total, err = h.q.CountJemaat(r.Context(), userID)
		}
	} else {
		pattern := "%" + escapeLike(strings.ToLower(query)) + "%"
		rows, err = h.q.SearchJemaat(r.Context(), sqlc.SearchJemaatParams{
			UserID:  userID,
			Pattern: pattern,
			Lim:     limit,
			Off:     offset,
		})
		if err == nil {
			total, err = h.q.CountSearchJemaat(r.Context(), sqlc.CountSearchJemaatParams{
				UserID:  userID,
				Pattern: pattern,
			})
		}
	}
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to list jemaat")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"data":   rows,
		"total":  total,
		"limit":  limit,
		"offset": offset,
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
	userID := appmw.GetUserID(r)
	if err := h.validateKeluargaRef(r, userID, req.KeluargaID); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	row, err := h.q.CreateJemaat(r.Context(), sqlc.CreateJemaatParams{
		UserID:           userID,
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
		httpx.WriteError(w, http.StatusInternalServerError, "failed to create jemaat")
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
	row, err := h.q.GetJemaat(r.Context(), sqlc.GetJemaatParams{
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
	userID := appmw.GetUserID(r)
	if err := h.validateKeluargaRef(r, userID, req.KeluargaID); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	row, err := h.q.UpdateJemaat(r.Context(), sqlc.UpdateJemaatParams{
		ID:               id,
		UserID:           userID,
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
	if errors.Is(err, sql.ErrNoRows) {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to update jemaat")
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
	if _, err := h.q.GetJemaat(r.Context(), sqlc.GetJemaatParams{ID: id, UserID: userID}); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteError(w, http.StatusNotFound, "not found")
			return
		}
		httpx.WriteError(w, http.StatusInternalServerError, "db error")
		return
	}
	if err := h.q.DeactivateJemaat(r.Context(), sqlc.DeactivateJemaatParams{ID: id, UserID: userID}); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "delete failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) validateKeluargaRef(r *http.Request, userID int64, id null.Int) error {
	if !id.Valid {
		return nil
	}
	_, err := h.q.GetKeluarga(r.Context(), sqlc.GetKeluargaParams{ID: id.Int64, UserID: userID})
	if errors.Is(err, sql.ErrNoRows) {
		return errors.New("keluarga_id does not exist")
	}
	return err
}

func escapeLike(s string) string {
	r := strings.NewReplacer(`\`, ``, `%`, ``, `_`, ``)
	return r.Replace(s)
}
