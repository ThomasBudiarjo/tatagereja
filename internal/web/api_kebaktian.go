package web

import (
	"database/sql"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/tatagereja/tatagereja/internal/db/sqlc"
)

type kebaktianDTO struct {
	ID              int64   `json:"id"`
	Nama            string  `json:"nama"`
	WaktuMulai      string  `json:"waktu_mulai"`
	WaktuMulaiLocal string  `json:"waktu_mulai_local"`
	WaktuMulaiText  string  `json:"waktu_mulai_text"`
	Lokasi          *string `json:"lokasi"`
	Tema            *string `json:"tema"`
	Pengkhotbah     *string `json:"pengkhotbah"`
	Catatan         *string `json:"catatan"`
	CreatedAt       string  `json:"created_at"`
	UpdatedAt       string  `json:"updated_at"`
}

func toKebaktianDTO(k sqlc.Kebaktian, tz string) kebaktianDTO {
	return kebaktianDTO{
		ID:              k.ID,
		Nama:            k.Nama,
		WaktuMulai:      k.WaktuMulai,
		WaktuMulaiLocal: toLocalInput(k.WaktuMulai, tz),
		WaktuMulaiText:  formatDateTime(k.WaktuMulai, tz, ""),
		Lokasi:          nullStrPtr(k.Lokasi),
		Tema:            nullStrPtr(k.Tema),
		Pengkhotbah:     nullStrPtr(k.Pengkhotbah),
		Catatan:         nullStrPtr(k.Catatan),
		CreatedAt:       k.CreatedAt,
		UpdatedAt:       k.UpdatedAt,
	}
}

type kebaktianReq struct {
	Nama            string `json:"nama"`
	WaktuMulaiLocal string `json:"waktu_mulai_local"`
	Lokasi          string `json:"lokasi"`
	Tema            string `json:"tema"`
	Pengkhotbah     string `json:"pengkhotbah"`
	Catatan         string `json:"catatan"`
}

func mountAPIKebaktian(r chi.Router, q *sqlc.Queries) {
	r.Route("/kebaktian", func(r chi.Router) {
		r.Get("/", apiKebaktianList(q))
		r.Post("/", apiKebaktianCreate(q))
		r.Get("/{id}", apiKebaktianGet(q))
		r.Put("/{id}", apiKebaktianUpdate(q))
		r.Delete("/{id}", apiKebaktianDelete(q))
	})
}

func apiKebaktianList(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		user, err := LoadUser(r.Context(), q, r)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		from := r.URL.Query().Get("from")
		to := r.URL.Query().Get("to")
		limit, offset := ParsePagination(r)

		var items []sqlc.Kebaktian
		if from != "" || to != "" {
			startUTC, endUTC, rangeErr := DateRangeUTC(from, to, user.Timezone)
			if rangeErr != nil {
				writeJSONError(w, http.StatusBadRequest, "invalid date range")
				return
			}
			if from == "" {
				startUTC = "1970-01-01T00:00:00.000000Z"
			}
			if to == "" {
				endUTC = "9999-12-31T23:59:59.999999Z"
			}
			items, err = q.ListKebaktianRange(r.Context(), sqlc.ListKebaktianRangeParams{
				UserID: uid, WaktuMulai: startUTC, WaktuMulai_2: endUTC,
			})
		} else {
			items, err = q.ListKebaktian(r.Context(), sqlc.ListKebaktianParams{
				UserID: uid, Limit: limit, Offset: offset,
			})
		}
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		dtos := make([]kebaktianDTO, 0, len(items))
		for _, k := range items {
			dtos = append(dtos, toKebaktianDTO(k, user.Timezone))
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": dtos})
	}
}

func apiKebaktianGet(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		user, err := LoadUser(r.Context(), q, r)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		id, err := ParseChiID(r)
		if err != nil {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		k, err := q.GetKebaktian(r.Context(), sqlc.GetKebaktianParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"kebaktian": toKebaktianDTO(k, user.Timezone)})
	}
}

func apiKebaktianCreate(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req kebaktianReq
		if err := decodeJSON(w, r, &req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request")
			return
		}
		uid := UserID(r)
		user, err := LoadUser(r.Context(), q, r)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		params, errs := validateKebaktianReq(req, user.Timezone)
		if len(errs) > 0 {
			writeValidationErrors(w, errs)
			return
		}
		params.UserID = uid
		row, err := q.CreateKebaktian(r.Context(), params)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"kebaktian": toKebaktianDTO(row, user.Timezone)})
	}
}

func apiKebaktianUpdate(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req kebaktianReq
		if err := decodeJSON(w, r, &req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request")
			return
		}
		uid := UserID(r)
		user, err := LoadUser(r.Context(), q, r)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		id, err := ParseChiID(r)
		if err != nil {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		params, errs := validateKebaktianReq(req, user.Timezone)
		if len(errs) > 0 {
			writeValidationErrors(w, errs)
			return
		}
		row, err := q.UpdateKebaktian(r.Context(), sqlc.UpdateKebaktianParams{
			Nama: params.Nama, WaktuMulai: params.WaktuMulai,
			Lokasi: params.Lokasi, Tema: params.Tema,
			Pengkhotbah: params.Pengkhotbah, Catatan: params.Catatan,
			ID: id, UserID: uid,
		})
		if errors.Is(err, sql.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"kebaktian": toKebaktianDTO(row, user.Timezone)})
	}
}

func apiKebaktianDelete(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := ParseChiID(r)
		if err != nil {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		if err := q.DeleteKebaktian(r.Context(), sqlc.DeleteKebaktianParams{ID: id, UserID: uid}); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		writeJSON(w, http.StatusNoContent, nil)
	}
}

func validateKebaktianReq(req kebaktianReq, tz string) (sqlc.CreateKebaktianParams, map[string]string) {
	errs := map[string]string{}
	Required(req.Nama, "Nama", errs)
	MaxLen(req.Nama, 200, "Nama", errs)
	Required(req.WaktuMulaiLocal, "WaktuMulai", errs)

	var waktuUTC string
	if req.WaktuMulaiLocal != "" {
		utc, err := localToUTC(req.WaktuMulaiLocal, tz)
		if err != nil {
			errs["WaktuMulai"] = "Format waktu tidak valid"
		} else {
			waktuUTC = utc
		}
	}
	MaxLen(req.Lokasi, 200, "Lokasi", errs)
	MaxLen(req.Tema, 300, "Tema", errs)
	MaxLen(req.Pengkhotbah, 200, "Pengkhotbah", errs)
	MaxLen(req.Catatan, 2000, "Catatan", errs)
	if len(errs) > 0 {
		return sqlc.CreateKebaktianParams{}, errs
	}
	return sqlc.CreateKebaktianParams{
		Nama: req.Nama, WaktuMulai: waktuUTC,
		Lokasi: NullStringFromForm(req.Lokasi), Tema: NullStringFromForm(req.Tema),
		Pengkhotbah: NullStringFromForm(req.Pengkhotbah), Catatan: NullStringFromForm(req.Catatan),
	}, errs
}

// localToUTC parses a datetime-local string ("2006-01-02T15:04") in the given
// IANA timezone and returns the canonical UTC storage format.
func localToUTC(local, tz string) (string, error) {
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	t, err := time.ParseInLocation("2006-01-02T15:04", local, loc)
	if err != nil {
		return "", err
	}
	return t.UTC().Format("2006-01-02T15:04:05.000000Z"), nil
}
