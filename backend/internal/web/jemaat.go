package web

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/tatagereja/tatagereja/backend/internal/db/sqlc"
)

const (
	jemaatStatusBelum  = "belum_menikah"
	jemaatStatusMenikah = "menikah"
	jemaatStatusCerai   = "cerai"
	jemaatStatusDuda    = "duda"
	jemaatStatusJanda   = "janda"
)

var jemaatStatusAllowed = []string{
	jemaatStatusBelum, jemaatStatusMenikah, jemaatStatusCerai,
	jemaatStatusDuda, jemaatStatusJanda,
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

type jemaatListPage struct {
	Title      string
	User       sqlc.User
	Flash      Flash
	Items      []sqlc.Jemaat
	Query      string
	Limit      int64
	Offset     int64
	Total      int64
	HasPrev    bool
	HasNext    bool
	PrevOffset int64
	NextOffset int64
}

type jemaatDetailPage struct {
	Title  string
	User   sqlc.User
	Flash  Flash
	Jemaat sqlc.Jemaat
}

type jemaatFormPage struct {
	Title    string
	User     sqlc.User
	Flash    Flash
	Errors   map[string]string
	Form     jemaatForm
	JemaatID int64
	Keluarga []sqlc.ListKeluargaOptionsRow
	IsEdit   bool
}

func mountJemaat(r chi.Router, q *sqlc.Queries, rdr *Renderer) {
	r.Route("/jemaat", func(r chi.Router) {
		r.Get("/", jemaatList(q, rdr))
		r.Get("/new", jemaatNewForm(q, rdr))
		r.Post("/", jemaatCreate(q, rdr))
		r.Get("/{id}", jemaatDetail(q, rdr))
		r.Get("/{id}/edit", jemaatEditForm(q, rdr))
		r.Put("/{id}", jemaatUpdate(q, rdr))
		r.Delete("/{id}", jemaatDelete(q, rdr))
	})
}

func jemaatList(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		user, err := LoadUser(r.Context(), q, r)
		if err != nil {
			WriteServerError(w, err)
			return
		}
		flash, _ := PopFlash(w, r)
		limit, offset := ParsePagination(r)
		qry := r.URL.Query().Get("q")

		var items []sqlc.Jemaat
		var total int64
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
			WriteServerError(w, err)
			return
		}

		data := jemaatListPage{
			Title:  "Jemaat",
			User:   user,
			Flash:  flash,
			Items:  items,
			Query:  qry,
			Limit:  limit,
			Offset: offset,
			Total:  total,
		}
		data.HasPrev = offset > 0
		data.HasNext = offset+limit < total
		if data.HasPrev {
			data.PrevOffset = offset - limit
			if data.PrevOffset < 0 {
				data.PrevOffset = 0
			}
		}
		if data.HasNext {
			data.NextOffset = offset + limit
		}
		if err := rdr.Page(w, r, "jemaat/list.html", data); err != nil {
			WriteServerError(w, err)
		}
	}
}

func jemaatNewForm(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		renderJemaatForm(w, r, q, rdr, 0, jemaatForm{}, map[string]string{}, false)
	}
}

func jemaatEditForm(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := ParseChiID(r)
		if err != nil {
			WriteNotFound(w)
			return
		}
		j, err := q.GetJemaat(r.Context(), sqlc.GetJemaatParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			WriteNotFound(w)
			return
		}
		if err != nil {
			WriteServerError(w, err)
			return
		}
		form := jemaatFromRow(j)
		renderJemaatForm(w, r, q, rdr, id, form, map[string]string{}, true)
	}
}

func jemaatCreate(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		uid := UserID(r)
		form, params, errs := parseJemaatForm(r, q, uid)
		if len(errs) > 0 {
			w.WriteHeader(http.StatusUnprocessableEntity)
			renderJemaatForm(w, r, q, rdr, 0, form, errs, false)
			return
		}
		params.UserID = uid
		row, err := q.CreateJemaat(r.Context(), params)
		if err != nil {
			WriteServerError(w, fmt.Errorf("create jemaat: %w", err))
			return
		}
		RedirectWithFlash(w, r, fmt.Sprintf("/jemaat/%d", row.ID), "Jemaat berhasil ditambahkan", "success")
	}
}

func jemaatUpdate(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		uid := UserID(r)
		id, err := ParseChiID(r)
		if err != nil {
			WriteNotFound(w)
			return
		}
		form, params, errs := parseJemaatForm(r, q, uid)
		if len(errs) > 0 {
			w.WriteHeader(http.StatusUnprocessableEntity)
			renderJemaatForm(w, r, q, rdr, id, form, errs, true)
			return
		}
		_, err = q.UpdateJemaat(r.Context(), sqlc.UpdateJemaatParams{
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
			WriteNotFound(w)
			return
		}
		if err != nil {
			WriteServerError(w, fmt.Errorf("update jemaat: %w", err))
			return
		}
		RedirectWithFlash(w, r, fmt.Sprintf("/jemaat/%d", id), "Jemaat berhasil diperbarui", "success")
	}
}

func jemaatDelete(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := ParseChiID(r)
		if err != nil {
			WriteNotFound(w)
			return
		}
		err = q.DeactivateJemaat(r.Context(), sqlc.DeactivateJemaatParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			WriteNotFound(w)
			return
		}
		if err != nil {
			WriteServerError(w, fmt.Errorf("deactivate jemaat: %w", err))
			return
		}
		if IsHTMX(r) {
			w.WriteHeader(http.StatusOK)
			return
		}
		RedirectWithFlash(w, r, "/jemaat", "Jemaat berhasil dihapus", "success")
	}
}

func jemaatDetail(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		user, err := LoadUser(r.Context(), q, r)
		if err != nil {
			WriteServerError(w, err)
			return
		}
		flash, _ := PopFlash(w, r)
		id, err := ParseChiID(r)
		if err != nil {
			WriteNotFound(w)
			return
		}
		j, err := q.GetJemaat(r.Context(), sqlc.GetJemaatParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			WriteNotFound(w)
			return
		}
		if err != nil {
			WriteServerError(w, err)
			return
		}
		if err := rdr.Page(w, r, "jemaat/detail.html", jemaatDetailPage{
			Title:  j.NamaLengkap,
			User:   user,
			Flash:  flash,
			Jemaat: j,
		}); err != nil {
			WriteServerError(w, err)
		}
	}
}

func renderJemaatForm(w http.ResponseWriter, r *http.Request, q *sqlc.Queries, rdr *Renderer, id int64, form jemaatForm, errs map[string]string, isEdit bool) {
	uid := UserID(r)
	user, err := LoadUser(r.Context(), q, r)
	if err != nil {
		WriteServerError(w, err)
		return
	}
	flash, _ := PopFlash(w, r)
	keluarga, err := q.ListKeluargaOptions(r.Context(), uid)
	if err != nil {
		WriteServerError(w, err)
		return
	}
	title := "Tambah Jemaat"
	if isEdit {
		title = "Edit Jemaat"
	}
	if err := rdr.Page(w, r, "jemaat/form.html", jemaatFormPage{
		Title:    title,
		User:     user,
		Flash:    flash,
		Errors:   errs,
		Form:     form,
		JemaatID: id,
		Keluarga: keluarga,
		IsEdit:   isEdit,
	}); err != nil {
		WriteServerError(w, err)
	}
}

func jemaatFromRow(j sqlc.Jemaat) jemaatForm {
	return jemaatForm{
		NamaLengkap:      j.NamaLengkap,
		NamaPanggilan:    derefString(j.NamaPanggilan),
		JenisKelamin:     derefString(j.JenisKelamin),
		TanggalLahir:     derefString(j.TanggalLahir),
		TempatLahir:      derefString(j.TempatLahir),
		Alamat:           derefString(j.Alamat),
		NomorTelepon:     derefString(j.NomorTelepon),
		Email:            derefString(j.Email),
		StatusPernikahan: derefString(j.StatusPernikahan),
		TanggalBaptis:    derefString(j.TanggalBaptis),
		TanggalSidi:      derefString(j.TanggalSidi),
		KeluargaID:       nullInt64(j.KeluargaID),
		Catatan:          derefString(j.Catatan),
	}
}

func parseJemaatForm(r *http.Request, q *sqlc.Queries, uid int64) (jemaatForm, sqlc.CreateJemaatParams, map[string]string) {
	errs := map[string]string{}
	form := jemaatForm{
		NamaLengkap:      FormString(r, "nama_lengkap"),
		NamaPanggilan:    FormString(r, "nama_panggilan"),
		JenisKelamin:     FormString(r, "jenis_kelamin"),
		TanggalLahir:     FormDate(r, "tanggal_lahir"),
		TempatLahir:      FormString(r, "tempat_lahir"),
		Alamat:           FormString(r, "alamat"),
		NomorTelepon:     FormString(r, "nomor_telepon"),
		Email:            FormString(r, "email"),
		StatusPernikahan: FormString(r, "status_pernikahan"),
		TanggalBaptis:    FormDate(r, "tanggal_baptis"),
		TanggalSidi:      FormDate(r, "tanggal_sidi"),
		KeluargaID:       FormString(r, "keluarga_id"),
		Catatan:          FormString(r, "catatan"),
	}

	Required(form.NamaLengkap, "NamaLengkap", errs)
	MaxLen(form.NamaLengkap, 200, "NamaLengkap", errs)
	MaxLen(form.NamaPanggilan, 100, "NamaPanggilan", errs)
	OneOf(form.JenisKelamin, []string{"", "L", "P"}, "JenisKelamin", errs)
	PastDate(form.TanggalLahir, "TanggalLahir", errs)
	PastDate(form.TanggalBaptis, "TanggalBaptis", errs)
	PastDate(form.TanggalSidi, "TanggalSidi", errs)
	if form.TanggalBaptis != "" && form.TanggalSidi != "" && CompareDates(form.TanggalSidi, form.TanggalBaptis) < 0 {
		errs["TanggalSidi"] = "Tanggal sidi tidak boleh sebelum tanggal baptis"
	}
	MaxLen(form.TempatLahir, 100, "TempatLahir", errs)
	MaxLen(form.Alamat, 500, "Alamat", errs)
	MaxLen(form.NomorTelepon, 30, "NomorTelepon", errs)
	ValidEmail(form.Email, "Email", errs)
	MaxLen(form.Email, 200, "Email", errs)
	OneOf(form.StatusPernikahan, append([]string{""}, jemaatStatusAllowed...), "StatusPernikahan", errs)
	MaxLen(form.Catatan, 2000, "Catatan", errs)

	var keluargaID sql.NullInt64
	if form.KeluargaID != "" {
		kid, err := strconv.ParseInt(form.KeluargaID, 10, 64)
		if err != nil {
			errs["KeluargaID"] = "Keluarga tidak valid"
		} else {
			_, err = q.GetKeluarga(r.Context(), sqlc.GetKeluargaParams{ID: kid, UserID: uid})
			if errors.Is(err, sql.ErrNoRows) {
				errs["KeluargaID"] = "Keluarga tidak ditemukan"
			} else if err != nil {
				errs["KeluargaID"] = "Keluarga tidak valid"
			} else {
				keluargaID = sql.NullInt64{Int64: kid, Valid: true}
			}
		}
	}

	tglLahir, ok1 := OptionalDate(form.TanggalLahir, "TanggalLahir", errs)
	tglBaptis, ok2 := OptionalDate(form.TanggalBaptis, "TanggalBaptis", errs)
	tglSidi, ok3 := OptionalDate(form.TanggalSidi, "TanggalSidi", errs)
	if !ok1 || !ok2 || !ok3 {
		return form, sqlc.CreateJemaatParams{}, errs
	}

	params := sqlc.CreateJemaatParams{
		NamaLengkap:      form.NamaLengkap,
		NamaPanggilan:    NullStringFromForm(form.NamaPanggilan),
		JenisKelamin:     NullStringFromForm(form.JenisKelamin),
		TanggalLahir:     tglLahir,
		TempatLahir:      NullStringFromForm(form.TempatLahir),
		Alamat:           NullStringFromForm(form.Alamat),
		NomorTelepon:     NullStringFromForm(form.NomorTelepon),
		Email:            NullStringFromForm(form.Email),
		StatusPernikahan: NullStringFromForm(form.StatusPernikahan),
		TanggalBaptis:    tglBaptis,
		TanggalSidi:      tglSidi,
		KeluargaID:       keluargaID,
		Catatan:          NullStringFromForm(form.Catatan),
	}
	return form, params, errs
}
