package web

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/tatagereja/tatagereja/internal/db/sqlc"
)

type serviceTypeDTO struct {
	ID        int64   `json:"id"`
	Nama      string  `json:"nama"`
	Deskripsi *string `json:"deskripsi"`
	Urutan    int64   `json:"urutan"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
}

func toServiceTypeDTO(s sqlc.ServiceType) serviceTypeDTO {
	return serviceTypeDTO{
		ID:        s.ID,
		Nama:      s.Nama,
		Deskripsi: nullStrPtr(s.Deskripsi),
		Urutan:    s.Urutan,
		CreatedAt: s.CreatedAt,
		UpdatedAt: s.UpdatedAt,
	}
}

type serviceTypeReq struct {
	Nama      string `json:"nama"`
	Deskripsi string `json:"deskripsi"`
	Urutan    string `json:"urutan"`
}

func mountAPIServiceTypes(r chi.Router, q *sqlc.Queries) {
	r.Route("/service-types", func(r chi.Router) {
		r.Get("/", apiServiceTypeList(q))
		r.Post("/", apiServiceTypeCreate(q))
		r.Put("/{id}", apiServiceTypeUpdate(q))
		r.Delete("/{id}", apiServiceTypeDelete(q))
	})
}

func apiServiceTypeList(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		items, err := q.ListServiceTypes(r.Context(), UserID(r))
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		dtos := make([]serviceTypeDTO, 0, len(items))
		for _, s := range items {
			dtos = append(dtos, toServiceTypeDTO(s))
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": dtos})
	}
}

func apiServiceTypeCreate(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req serviceTypeReq
		if err := decodeJSON(w, r, &req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request")
			return
		}
		params, errs := validateServiceTypeReq(req)
		if len(errs) > 0 {
			writeValidationErrors(w, errs)
			return
		}
		params.UserID = UserID(r)
		row, err := q.CreateServiceType(r.Context(), params)
		if err != nil {
			if IsUniqueViolation(err) {
				writeValidationErrors(w, map[string]string{"Nama": "Nama sudah digunakan"})
				return
			}
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"service_type": toServiceTypeDTO(row)})
	}
}

func apiServiceTypeUpdate(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req serviceTypeReq
		if err := decodeJSON(w, r, &req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request")
			return
		}
		uid := UserID(r)
		id, err := ParseChiID(r)
		if err != nil {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		params, errs := validateServiceTypeReq(req)
		if len(errs) > 0 {
			writeValidationErrors(w, errs)
			return
		}
		row, err := q.UpdateServiceType(r.Context(), sqlc.UpdateServiceTypeParams{
			Nama: params.Nama, Deskripsi: params.Deskripsi, Urutan: params.Urutan,
			ID: id, UserID: uid,
		})
		if errors.Is(err, sql.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		if err != nil {
			if IsUniqueViolation(err) {
				writeValidationErrors(w, map[string]string{"Nama": "Nama sudah digunakan"})
				return
			}
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"service_type": toServiceTypeDTO(row)})
	}
}

func apiServiceTypeDelete(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := ParseChiID(r)
		if err != nil {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		count, err := q.CountJadwalByServiceType(r.Context(), sqlc.CountJadwalByServiceTypeParams{
			ServiceTypeID: id, UserID: uid,
		})
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		if count > 0 {
			writeJSONError(w, http.StatusConflict, "Jenis pelayanan masih digunakan di jadwal")
			return
		}
		if err := q.DeleteServiceType(r.Context(), sqlc.DeleteServiceTypeParams{ID: id, UserID: uid}); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		writeJSON(w, http.StatusNoContent, nil)
	}
}

func validateServiceTypeReq(req serviceTypeReq) (sqlc.CreateServiceTypeParams, map[string]string) {
	errs := map[string]string{}
	Required(req.Nama, "Nama", errs)
	MaxLen(req.Nama, 100, "Nama", errs)
	MaxLen(req.Deskripsi, 500, "Deskripsi", errs)
	urutan := int64(0)
	if req.Urutan != "" {
		n, err := strconv.ParseInt(req.Urutan, 10, 64)
		if err != nil {
			errs["Urutan"] = "Urutan harus angka"
		} else {
			urutan = n
		}
	}
	return sqlc.CreateServiceTypeParams{
		Nama: req.Nama, Deskripsi: NullStringFromForm(req.Deskripsi), Urutan: urutan,
	}, errs
}
