package web

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/thomasbudiarjo/tatagereja/backend/internal/db/sqlc"
)

func mountJemaat(r chi.Router, q *sqlc.Queries, rdr *Renderer) {
	r.Get("/jemaat", jemaatList(q, rdr))
	r.Get("/jemaat/new", jemaatNewForm(q, rdr))
	r.Post("/jemaat", jemaatCreate(q, rdr))
	r.Get("/jemaat/{id}", jemaatDetail(q, rdr))
	r.Get("/jemaat/{id}/edit", jemaatEditForm(q, rdr))
	r.Put("/jemaat/{id}", jemaatUpdate(q, rdr))
	r.Post("/jemaat/{id}", jemaatUpdate(q, rdr)) // HTML form fallback
	r.Delete("/jemaat/{id}", jemaatDelete(q, rdr))
	r.Post("/jemaat/{id}/delete", jemaatDelete(q, rdr)) // HTML form fallback
}

type jemaatForm struct {
	NamaLengkap      string
	NamaPanggilan    string
	JenisKelamin     string
	TanggalLahir     string
	TempatLahir      string
	Alamat           string
	NomorTelepon     string
	Email            string
	StatusPernikahan string
	TanggalBaptis    string
	TanggalSidi      string
	KeluargaID       string
	Catatan          string
}

func jemaatList(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		limit, offset := ParsePagination(r)
		search := r.URL.Query().Get("q")

		var items []sqlc.Jemaat
		var total int64
		var err error

		if search != "" {
			pattern := EscapeLike(search)
			items, err = q.SearchJemaat(r.Context(), sqlc.SearchJemaatParams{
				UserID: uid, Query: pattern, Limit: limit, Offset: offset,
			})
			if err == nil {
				total, err = q.CountJemaatSearch(r.Context(), sqlc.CountJemaatSearchParams{
					UserID: uid, Query: pattern,
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
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}

		rdr.Page(w, r, "jemaat/list", map[string]any{
			"Items":  items,
			"Total":  total,
			"Limit":  limit,
			"Offset": offset,
			"Search": search,
		})
	}
}

func jemaatNewForm(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		keluargas, _ := q.ListAllKeluarga(r.Context(), uid)
		rdr.Page(w, r, "jemaat/form", map[string]any{
			"Form":      jemaatForm{},
			"Errors":    map[string]string{},
			"Keluargas": keluargas,
			"IsNew":     true,
		})
	}
}

func jemaatCreate(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		if err := r.ParseForm(); err != nil {
			http.Error(w, "Bad Request", http.StatusBadRequest)
			return
		}

		form := jemaatForm{
			NamaLengkap:      FormString(r, "nama_lengkap"),
			NamaPanggilan:    FormString(r, "nama_panggilan"),
			JenisKelamin:     FormString(r, "jenis_kelamin"),
			TanggalLahir:     FormString(r, "tanggal_lahir"),
			TempatLahir:      FormString(r, "tempat_lahir"),
			Alamat:           FormString(r, "alamat"),
			NomorTelepon:     FormString(r, "nomor_telepon"),
			Email:            FormString(r, "email"),
			StatusPernikahan: FormString(r, "status_pernikahan"),
			TanggalBaptis:    FormString(r, "tanggal_baptis"),
			TanggalSidi:      FormString(r, "tanggal_sidi"),
			KeluargaID:       FormString(r, "keluarga_id"),
			Catatan:          FormString(r, "catatan"),
		}

		errs := validateJemaatForm(form)
		if len(errs) > 0 {
			keluargas, _ := q.ListAllKeluarga(r.Context(), uid)
			w.WriteHeader(http.StatusUnprocessableEntity)
			rdr.Page(w, r, "jemaat/form", map[string]any{
				"Form": form, "Errors": errs, "Keluargas": keluargas, "IsNew": true,
			})
			return
		}

		params := buildCreateJemaatParams(uid, form)
		j, err := q.CreateJemaat(r.Context(), params)
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}

		SetFlash(w, "Jemaat berhasil ditambahkan.", "success")
		redirectTo := "/jemaat/" + strconv.FormatInt(j.ID, 10)
		if IsHTMX(r) {
			HXRedirect(w, redirectTo)
			return
		}
		http.Redirect(w, r, redirectTo, http.StatusSeeOther)
	}
}

func jemaatDetail(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		j, err := q.GetJemaat(r.Context(), sqlc.GetJemaatParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}

		var keluarga *sqlc.Keluarga
		if j.KeluargaID.Valid {
			k, err := q.GetKeluarga(r.Context(), sqlc.GetKeluargaParams{ID: j.KeluargaID.Int64, UserID: uid})
			if err == nil {
				keluarga = &k
			}
		}

		rdr.Page(w, r, "jemaat/detail", map[string]any{
			"Jemaat":   j,
			"Keluarga": keluarga,
		})
	}
}

func jemaatEditForm(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		j, err := q.GetJemaat(r.Context(), sqlc.GetJemaatParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}

		keluargas, _ := q.ListAllKeluarga(r.Context(), uid)
		form := jemaatToForm(j)
		rdr.Page(w, r, "jemaat/form", map[string]any{
			"Form": form, "Errors": map[string]string{}, "Keluargas": keluargas,
			"IsNew": false, "ID": j.ID,
		})
	}
}

func jemaatUpdate(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		if _, err := q.GetJemaat(r.Context(), sqlc.GetJemaatParams{ID: id, UserID: uid}); errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}

		if err := r.ParseForm(); err != nil {
			http.Error(w, "Bad Request", http.StatusBadRequest)
			return
		}

		form := jemaatForm{
			NamaLengkap:      FormString(r, "nama_lengkap"),
			NamaPanggilan:    FormString(r, "nama_panggilan"),
			JenisKelamin:     FormString(r, "jenis_kelamin"),
			TanggalLahir:     FormString(r, "tanggal_lahir"),
			TempatLahir:      FormString(r, "tempat_lahir"),
			Alamat:           FormString(r, "alamat"),
			NomorTelepon:     FormString(r, "nomor_telepon"),
			Email:            FormString(r, "email"),
			StatusPernikahan: FormString(r, "status_pernikahan"),
			TanggalBaptis:    FormString(r, "tanggal_baptis"),
			TanggalSidi:      FormString(r, "tanggal_sidi"),
			KeluargaID:       FormString(r, "keluarga_id"),
			Catatan:          FormString(r, "catatan"),
		}

		errs := validateJemaatForm(form)
		if len(errs) > 0 {
			keluargas, _ := q.ListAllKeluarga(r.Context(), uid)
			w.WriteHeader(http.StatusUnprocessableEntity)
			rdr.Page(w, r, "jemaat/form", map[string]any{
				"Form": form, "Errors": errs, "Keluargas": keluargas, "IsNew": false, "ID": id,
			})
			return
		}

		params := buildUpdateJemaatParams(id, uid, form)
		j, err := q.UpdateJemaat(r.Context(), params)
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}

		SetFlash(w, "Jemaat berhasil diperbarui.", "success")
		redirectTo := "/jemaat/" + strconv.FormatInt(j.ID, 10)
		if IsHTMX(r) {
			HXRedirect(w, redirectTo)
			return
		}
		http.Redirect(w, r, redirectTo, http.StatusSeeOther)
	}
}

func jemaatDelete(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		if err := q.DeactivateJemaat(r.Context(), sqlc.DeactivateJemaatParams{ID: id, UserID: uid}); err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		SetFlash(w, "Jemaat dinonaktifkan.", "success")
		if IsHTMX(r) {
			HXRedirect(w, "/jemaat")
			return
		}
		http.Redirect(w, r, "/jemaat", http.StatusSeeOther)
	}
}

func validateJemaatForm(f jemaatForm) map[string]string {
	errs := map[string]string{}
	Required(f.NamaLengkap, "NamaLengkap", errs)
	MaxLen(f.NamaLengkap, 200, "NamaLengkap", errs)
	MaxLen(f.NamaPanggilan, 100, "NamaPanggilan", errs)
	OneOf(f.JenisKelamin, []string{"", "L", "P"}, "JenisKelamin", errs)
	ValidDate(f.TanggalLahir, "TanggalLahir", errs)
	ValidDate(f.TanggalBaptis, "TanggalBaptis", errs)
	ValidDate(f.TanggalSidi, "TanggalSidi", errs)
	MaxLen(f.TempatLahir, 100, "TempatLahir", errs)
	MaxLen(f.Alamat, 500, "Alamat", errs)
	MaxLen(f.NomorTelepon, 30, "NomorTelepon", errs)
	ValidEmail(f.Email, "Email", errs)
	MaxLen(f.Email, 200, "Email", errs)
	OneOf(f.StatusPernikahan, []string{"", "belum_menikah", "menikah", "cerai", "duda", "janda"}, "StatusPernikahan", errs)
	MaxLen(f.Catatan, 2000, "Catatan", errs)
	return errs
}

func nullStr(s string) sql.NullString {
	return sql.NullString{String: s, Valid: s != ""}
}

func nullInt64(s string) sql.NullInt64 {
	if s == "" {
		return sql.NullInt64{}
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: n, Valid: true}
}

func buildCreateJemaatParams(uid int64, f jemaatForm) sqlc.CreateJemaatParams {
	return sqlc.CreateJemaatParams{
		UserID:           uid,
		NamaLengkap:      f.NamaLengkap,
		NamaPanggilan:    nullStr(f.NamaPanggilan),
		JenisKelamin:     nullStr(f.JenisKelamin),
		TanggalLahir:     nullStr(f.TanggalLahir),
		TempatLahir:      nullStr(f.TempatLahir),
		Alamat:           nullStr(f.Alamat),
		NomorTelepon:     nullStr(f.NomorTelepon),
		Email:            nullStr(f.Email),
		StatusPernikahan: nullStr(f.StatusPernikahan),
		TanggalBaptis:    nullStr(f.TanggalBaptis),
		TanggalSidi:      nullStr(f.TanggalSidi),
		KeluargaID:       nullInt64(f.KeluargaID),
		Catatan:          nullStr(f.Catatan),
	}
}

func buildUpdateJemaatParams(id, uid int64, f jemaatForm) sqlc.UpdateJemaatParams {
	return sqlc.UpdateJemaatParams{
		ID:               id,
		UserID:           uid,
		NamaLengkap:      f.NamaLengkap,
		NamaPanggilan:    nullStr(f.NamaPanggilan),
		JenisKelamin:     nullStr(f.JenisKelamin),
		TanggalLahir:     nullStr(f.TanggalLahir),
		TempatLahir:      nullStr(f.TempatLahir),
		Alamat:           nullStr(f.Alamat),
		NomorTelepon:     nullStr(f.NomorTelepon),
		Email:            nullStr(f.Email),
		StatusPernikahan: nullStr(f.StatusPernikahan),
		TanggalBaptis:    nullStr(f.TanggalBaptis),
		TanggalSidi:      nullStr(f.TanggalSidi),
		KeluargaID:       nullInt64(f.KeluargaID),
		Catatan:          nullStr(f.Catatan),
	}
}

func jemaatToForm(j sqlc.Jemaat) jemaatForm {
	return jemaatForm{
		NamaLengkap:      j.NamaLengkap,
		NamaPanggilan:    j.NamaPanggilan.String,
		JenisKelamin:     j.JenisKelamin.String,
		TanggalLahir:     j.TanggalLahir.String,
		TempatLahir:      j.TempatLahir.String,
		Alamat:           j.Alamat.String,
		NomorTelepon:     j.NomorTelepon.String,
		Email:            j.Email.String,
		StatusPernikahan: j.StatusPernikahan.String,
		TanggalBaptis:    j.TanggalBaptis.String,
		TanggalSidi:      j.TanggalSidi.String,
		KeluargaID: func() string {
			if j.KeluargaID.Valid {
				return strconv.FormatInt(j.KeluargaID.Int64, 10)
			}
			return ""
		}(),
		Catatan:          j.Catatan.String,
	}
}
