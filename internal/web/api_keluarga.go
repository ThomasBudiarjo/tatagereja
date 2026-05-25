package web

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/tatagereja/tatagereja/internal/db/sqlc"
)

type keluargaDTO struct {
	ID           int64   `json:"id"`
	NamaKeluarga string  `json:"nama_keluarga"`
	Alamat       *string `json:"alamat"`
	Catatan      *string `json:"catatan"`
	CreatedAt    string  `json:"created_at"`
	UpdatedAt    string  `json:"updated_at"`
}

func toKeluargaDTO(k sqlc.Keluarga) keluargaDTO {
	return keluargaDTO{
		ID:           k.ID,
		NamaKeluarga: k.NamaKeluarga,
		Alamat:       nullStrPtr(k.Alamat),
		Catatan:      nullStrPtr(k.Catatan),
		CreatedAt:    k.CreatedAt,
		UpdatedAt:    k.UpdatedAt,
	}
}

type keluargaReq struct {
	NamaKeluarga string `json:"nama_keluarga"`
	Alamat       string `json:"alamat"`
	Catatan      string `json:"catatan"`
}

func mountAPIKeluarga(r chi.Router, q *sqlc.Queries) {
	r.Route("/keluarga", func(r chi.Router) {
		r.Get("/", apiKeluargaList(q))
		r.Get("/options", apiKeluargaOptions(q))
		r.Post("/", apiKeluargaCreate(q))
		r.Get("/{id}", apiKeluargaGet(q))
		r.Put("/{id}", apiKeluargaUpdate(q))
		r.Delete("/{id}", apiKeluargaDelete(q))
	})
}

func apiKeluargaList(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		items, err := q.ListKeluarga(r.Context(), UserID(r))
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		dtos := make([]keluargaDTO, 0, len(items))
		for _, k := range items {
			dtos = append(dtos, toKeluargaDTO(k))
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": dtos})
	}
}

func apiKeluargaOptions(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		opts, err := q.ListKeluargaOptions(r.Context(), UserID(r))
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": opts})
	}
}

func apiKeluargaGet(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := ParseChiID(r)
		if err != nil {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		k, err := q.GetKeluarga(r.Context(), sqlc.GetKeluargaParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		members, err := q.ListJemaatByKeluarga(r.Context(), sqlc.ListJemaatByKeluargaParams{
			UserID: uid, KeluargaID: sql.NullInt64{Int64: id, Valid: true},
		})
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		memberDTOs := make([]jemaatDTO, 0, len(members))
		for _, m := range members {
			memberDTOs = append(memberDTOs, toJemaatDTO(m))
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"keluarga": toKeluargaDTO(k), "members": memberDTOs,
		})
	}
}

func apiKeluargaCreate(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req keluargaReq
		if err := decodeJSON(w, r, &req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request")
			return
		}
		params, errs := validateKeluargaReq(req)
		if len(errs) > 0 {
			writeValidationErrors(w, errs)
			return
		}
		params.UserID = UserID(r)
		row, err := q.CreateKeluarga(r.Context(), params)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"keluarga": toKeluargaDTO(row)})
	}
}

func apiKeluargaUpdate(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req keluargaReq
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
		params, errs := validateKeluargaReq(req)
		if len(errs) > 0 {
			writeValidationErrors(w, errs)
			return
		}
		row, err := q.UpdateKeluarga(r.Context(), sqlc.UpdateKeluargaParams{
			NamaKeluarga: params.NamaKeluarga,
			Alamat:       params.Alamat,
			Catatan:      params.Catatan,
			ID:           id,
			UserID:       uid,
		})
		if errors.Is(err, sql.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"keluarga": toKeluargaDTO(row)})
	}
}

func apiKeluargaDelete(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := ParseChiID(r)
		if err != nil {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		if err := q.DeleteKeluarga(r.Context(), sqlc.DeleteKeluargaParams{ID: id, UserID: uid}); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		writeJSON(w, http.StatusNoContent, nil)
	}
}

func validateKeluargaReq(req keluargaReq) (sqlc.CreateKeluargaParams, map[string]string) {
	errs := map[string]string{}
	Required(req.NamaKeluarga, "NamaKeluarga", errs)
	MaxLen(req.NamaKeluarga, 200, "NamaKeluarga", errs)
	MaxLen(req.Alamat, 500, "Alamat", errs)
	MaxLen(req.Catatan, 2000, "Catatan", errs)
	return sqlc.CreateKeluargaParams{
		NamaKeluarga: req.NamaKeluarga,
		Alamat:       NullStringFromForm(req.Alamat),
		Catatan:      NullStringFromForm(req.Catatan),
	}, errs
}
