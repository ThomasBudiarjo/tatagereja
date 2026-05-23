package web

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/tatagereja/tatagereja/internal/db/sqlc"
)

const (
	jemaatStatusBelum   = "belum_menikah"
	jemaatStatusMenikah = "menikah"
	jemaatStatusCerai   = "cerai"
	jemaatStatusDuda    = "duda"
	jemaatStatusJanda   = "janda"
)

var jemaatStatusAllowed = []string{
	jemaatStatusBelum, jemaatStatusMenikah, jemaatStatusCerai,
	jemaatStatusDuda, jemaatStatusJanda,
}

type jemaatDTO struct {
	ID               int64   `json:"id"`
	NamaLengkap      string  `json:"nama_lengkap"`
	NamaPanggilan    *string `json:"nama_panggilan"`
	JenisKelamin     *string `json:"jenis_kelamin"`
	TanggalLahir     *string `json:"tanggal_lahir"`
	TempatLahir      *string `json:"tempat_lahir"`
	Alamat           *string `json:"alamat"`
	NomorTelepon     *string `json:"nomor_telepon"`
	Email            *string `json:"email"`
	StatusPernikahan *string `json:"status_pernikahan"`
	TanggalBaptis    *string `json:"tanggal_baptis"`
	TanggalSidi      *string `json:"tanggal_sidi"`
	KeluargaID       *int64  `json:"keluarga_id"`
	Catatan          *string `json:"catatan"`
	CreatedAt        string  `json:"created_at"`
	UpdatedAt        string  `json:"updated_at"`
}

func toJemaatDTO(j sqlc.Jemaat) jemaatDTO {
	return jemaatDTO{
		ID:               j.ID,
		NamaLengkap:      j.NamaLengkap,
		NamaPanggilan:    nullStrPtr(j.NamaPanggilan),
		JenisKelamin:     nullStrPtr(j.JenisKelamin),
		TanggalLahir:     nullStrPtr(j.TanggalLahir),
		TempatLahir:      nullStrPtr(j.TempatLahir),
		Alamat:           nullStrPtr(j.Alamat),
		NomorTelepon:     nullStrPtr(j.NomorTelepon),
		Email:            nullStrPtr(j.Email),
		StatusPernikahan: nullStrPtr(j.StatusPernikahan),
		TanggalBaptis:    nullStrPtr(j.TanggalBaptis),
		TanggalSidi:      nullStrPtr(j.TanggalSidi),
		KeluargaID:       nullInt64Ptr(j.KeluargaID),
		Catatan:          nullStrPtr(j.Catatan),
		CreatedAt:        j.CreatedAt,
		UpdatedAt:        j.UpdatedAt,
	}
}

type jemaatReq struct {
	NamaLengkap      string `json:"nama_lengkap"`
	NamaPanggilan    string `json:"nama_panggilan"`
	JenisKelamin     string `json:"jenis_kelamin"`
	TanggalLahir     string `json:"tanggal_lahir"`
	TempatLahir      string `json:"tempat_lahir"`
	Alamat           string `json:"alamat"`
	NomorTelepon     string `json:"nomor_telepon"`
	Email            string `json:"email"`
	StatusPernikahan string `json:"status_pernikahan"`
	TanggalBaptis    string `json:"tanggal_baptis"`
	TanggalSidi      string `json:"tanggal_sidi"`
	KeluargaID       *int64 `json:"keluarga_id"`
	Catatan          string `json:"catatan"`
}

func mountAPIJemaat(r chi.Router, q *sqlc.Queries) {
	r.Route("/jemaat", func(r chi.Router) {
		r.Get("/", apiJemaatList(q))
		r.Get("/active", apiJemaatActive(q))
		r.Post("/", apiJemaatCreate(q))
		r.Get("/{id}", apiJemaatGet(q))
		r.Put("/{id}", apiJemaatUpdate(q))
		r.Delete("/{id}", apiJemaatDelete(q))
	})
}

// apiJemaatActive returns active jemaat as id/name options (used by the pelayan
// form to pick a member).
func apiJemaatActive(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		items, err := q.ListActiveJemaatNames(r.Context(), UserID(r))
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
	}
}

func apiJemaatList(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		limit, offset := ParsePagination(r)
		qry := r.URL.Query().Get("q")

		var items []sqlc.Jemaat
		var total int64
		var err error
		if qry != "" {
			pattern := EscapeLike(qry)
			items, err = q.SearchJemaat(r.Context(), sqlc.SearchJemaatParams{
				UserID: uid, NamaLengkap: pattern, Limit: limit, Offset: offset,
			})
			if err == nil {
				total, err = q.CountSearchJemaat(r.Context(), sqlc.CountSearchJemaatParams{
					UserID: uid, NamaLengkap: pattern,
				})
			}
		} else {
			items, err = q.ListJemaat(r.Context(), sqlc.ListJemaatParams{
				UserID: uid, Limit: limit, Offset: offset,
			})
			if err == nil {
				total, err = q.CountJemaat(r.Context(), uid)
			}
		}
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}

		dtos := make([]jemaatDTO, 0, len(items))
		for _, j := range items {
			dtos = append(dtos, toJemaatDTO(j))
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"items": dtos, "total": total, "limit": limit, "offset": offset, "q": qry,
		})
	}
}

func apiJemaatGet(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := ParseChiID(r)
		if err != nil {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		j, err := q.GetJemaat(r.Context(), sqlc.GetJemaatParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"jemaat": toJemaatDTO(j)})
	}
}

func apiJemaatCreate(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req jemaatReq
		if err := decodeJSON(r, &req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request")
			return
		}
		uid := UserID(r)
		params, errs := validateJemaatReq(r, q, uid, req)
		if len(errs) > 0 {
			writeValidationErrors(w, errs)
			return
		}
		params.UserID = uid
		row, err := q.CreateJemaat(r.Context(), params)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"jemaat": toJemaatDTO(row)})
	}
}

func apiJemaatUpdate(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req jemaatReq
		if err := decodeJSON(r, &req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request")
			return
		}
		uid := UserID(r)
		id, err := ParseChiID(r)
		if err != nil {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		params, errs := validateJemaatReq(r, q, uid, req)
		if len(errs) > 0 {
			writeValidationErrors(w, errs)
			return
		}
		row, err := q.UpdateJemaat(r.Context(), sqlc.UpdateJemaatParams{
			NamaLengkap:      params.NamaLengkap,
			NamaPanggilan:    params.NamaPanggilan,
			JenisKelamin:     params.JenisKelamin,
			TanggalLahir:     params.TanggalLahir,
			TempatLahir:      params.TempatLahir,
			Alamat:           params.Alamat,
			NomorTelepon:     params.NomorTelepon,
			Email:            params.Email,
			StatusPernikahan: params.StatusPernikahan,
			TanggalBaptis:    params.TanggalBaptis,
			TanggalSidi:      params.TanggalSidi,
			KeluargaID:       params.KeluargaID,
			Catatan:          params.Catatan,
			ID:               id,
			UserID:           uid,
		})
		if errors.Is(err, sql.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"jemaat": toJemaatDTO(row)})
	}
}

func apiJemaatDelete(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := ParseChiID(r)
		if err != nil {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		if err := q.DeactivateJemaat(r.Context(), sqlc.DeactivateJemaatParams{ID: id, UserID: uid}); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		writeJSON(w, http.StatusNoContent, nil)
	}
}

func validateJemaatReq(r *http.Request, q *sqlc.Queries, uid int64, req jemaatReq) (sqlc.CreateJemaatParams, map[string]string) {
	errs := map[string]string{}

	Required(req.NamaLengkap, "NamaLengkap", errs)
	MaxLen(req.NamaLengkap, 200, "NamaLengkap", errs)
	MaxLen(req.NamaPanggilan, 100, "NamaPanggilan", errs)
	OneOf(req.JenisKelamin, []string{"", "L", "P"}, "JenisKelamin", errs)
	PastDate(req.TanggalLahir, "TanggalLahir", errs)
	PastDate(req.TanggalBaptis, "TanggalBaptis", errs)
	PastDate(req.TanggalSidi, "TanggalSidi", errs)
	if req.TanggalBaptis != "" && req.TanggalSidi != "" && CompareDates(req.TanggalSidi, req.TanggalBaptis) < 0 {
		errs["TanggalSidi"] = "Tanggal sidi tidak boleh sebelum tanggal baptis"
	}
	MaxLen(req.TempatLahir, 100, "TempatLahir", errs)
	MaxLen(req.Alamat, 500, "Alamat", errs)
	MaxLen(req.NomorTelepon, 30, "NomorTelepon", errs)
	ValidEmail(req.Email, "Email", errs)
	MaxLen(req.Email, 200, "Email", errs)
	OneOf(req.StatusPernikahan, append([]string{""}, jemaatStatusAllowed...), "StatusPernikahan", errs)
	MaxLen(req.Catatan, 2000, "Catatan", errs)

	var keluargaID sql.NullInt64
	if req.KeluargaID != nil && *req.KeluargaID != 0 {
		_, err := q.GetKeluarga(r.Context(), sqlc.GetKeluargaParams{ID: *req.KeluargaID, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			errs["KeluargaID"] = "Keluarga tidak ditemukan"
		} else if err != nil {
			errs["KeluargaID"] = "Keluarga tidak valid"
		} else {
			keluargaID = sql.NullInt64{Int64: *req.KeluargaID, Valid: true}
		}
	}

	tglLahir, ok1 := OptionalDate(req.TanggalLahir, "TanggalLahir", errs)
	tglBaptis, ok2 := OptionalDate(req.TanggalBaptis, "TanggalBaptis", errs)
	tglSidi, ok3 := OptionalDate(req.TanggalSidi, "TanggalSidi", errs)
	if !ok1 || !ok2 || !ok3 || len(errs) > 0 {
		return sqlc.CreateJemaatParams{}, errs
	}

	return sqlc.CreateJemaatParams{
		NamaLengkap:      req.NamaLengkap,
		NamaPanggilan:    NullStringFromForm(req.NamaPanggilan),
		JenisKelamin:     NullStringFromForm(req.JenisKelamin),
		TanggalLahir:     tglLahir,
		TempatLahir:      NullStringFromForm(req.TempatLahir),
		Alamat:           NullStringFromForm(req.Alamat),
		NomorTelepon:     NullStringFromForm(req.NomorTelepon),
		Email:            NullStringFromForm(req.Email),
		StatusPernikahan: NullStringFromForm(req.StatusPernikahan),
		TanggalBaptis:    tglBaptis,
		TanggalSidi:      tglSidi,
		KeluargaID:       keluargaID,
		Catatan:          NullStringFromForm(req.Catatan),
	}, errs
}
