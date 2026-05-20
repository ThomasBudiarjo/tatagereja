package web

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/thomasbudiarjo/tatagereja/backend/internal/db/sqlc"
)

func mountKebaktian(r chi.Router, q *sqlc.Queries, rdr *Renderer) {
	r.Get("/kebaktian", kebaktianList(q, rdr))
	r.Get("/kebaktian/new", kebaktianNewForm(rdr))
	r.Post("/kebaktian", kebaktianCreate(q, rdr))
	r.Get("/kebaktian/{id}", kebaktianDetail(q, rdr))
	r.Get("/kebaktian/{id}/edit", kebaktianEditForm(q, rdr))
	r.Put("/kebaktian/{id}", kebaktianUpdate(q, rdr))
	r.Post("/kebaktian/{id}", kebaktianUpdate(q, rdr))
	r.Delete("/kebaktian/{id}", kebaktianDelete(q, rdr))
	r.Post("/kebaktian/{id}/delete", kebaktianDelete(q, rdr))
}

type kebaktianForm struct {
	Nama        string
	WaktuMulai  string // datetime-local value (local time)
	Lokasi      string
	Tema        string
	Pengkhotbah string
	Catatan     string
}

func kebaktianList(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		limit, offset := ParsePagination(r)
		from := r.URL.Query().Get("from")
		to := r.URL.Query().Get("to")

		var items []sqlc.Kebaktian
		var err error
		var total int64

		if from != "" && to != "" {
			items, err = q.ListKebaktianRange(r.Context(), uid, from+"T00:00:00Z", to+"T23:59:59Z")
		} else {
			items, err = q.ListKebaktian(r.Context(), sqlc.ListKebaktianParams{UserID: uid, Limit: limit, Offset: offset})
			if err == nil {
				total, _ = q.CountKebaktian(r.Context(), uid)
			}
		}
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}

		user, _ := r.Context().Value(userObjKey).(sqlc.User)
		rdr.Page(w, r, "kebaktian/list", map[string]any{
			"Items": items, "Total": total, "Limit": limit, "Offset": offset,
			"From": from, "To": to, "Timezone": user.Timezone,
		})
	}
}

func kebaktianNewForm(rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rdr.Page(w, r, "kebaktian/form", map[string]any{
			"Form": kebaktianForm{}, "Errors": map[string]string{}, "IsNew": true,
		})
	}
}

func kebaktianCreate(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		user, _ := r.Context().Value(userObjKey).(sqlc.User)
		if err := r.ParseForm(); err != nil {
			http.Error(w, "Bad Request", http.StatusBadRequest)
			return
		}
		form := kebaktianForm{
			Nama:        FormString(r, "nama"),
			WaktuMulai:  FormString(r, "waktu_mulai"),
			Lokasi:      FormString(r, "lokasi"),
			Tema:        FormString(r, "tema"),
			Pengkhotbah: FormString(r, "pengkhotbah"),
			Catatan:     FormString(r, "catatan"),
		}
		errs := validateKebaktianForm(form)
		if len(errs) > 0 {
			w.WriteHeader(http.StatusUnprocessableEntity)
			rdr.Page(w, r, "kebaktian/form", map[string]any{"Form": form, "Errors": errs, "IsNew": true})
			return
		}
		waktuUTC, err := ParseLocalDateTime(form.WaktuMulai, user.Timezone)
		if err != nil {
			errs["WaktuMulai"] = "Format waktu tidak valid."
			w.WriteHeader(http.StatusUnprocessableEntity)
			rdr.Page(w, r, "kebaktian/form", map[string]any{"Form": form, "Errors": errs, "IsNew": true})
			return
		}
		k, err := q.CreateKebaktian(r.Context(), sqlc.CreateKebaktianParams{
			UserID: uid, Nama: form.Nama, WaktuMulai: waktuUTC,
			Lokasi: nullStr(form.Lokasi), Tema: nullStr(form.Tema),
			Pengkhotbah: nullStr(form.Pengkhotbah), Catatan: nullStr(form.Catatan),
		})
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		SetFlash(w, "Kebaktian berhasil ditambahkan.", "success")
		redirectTo := "/kebaktian/" + strconv.FormatInt(k.ID, 10)
		if IsHTMX(r) {
			HXRedirect(w, redirectTo)
			return
		}
		http.Redirect(w, r, redirectTo, http.StatusSeeOther)
	}
}

func kebaktianDetail(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		k, err := q.GetKebaktian(r.Context(), sqlc.GetKebaktianParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		jadwal, _ := q.ListJadwalByKebaktian(r.Context(), sqlc.ListJadwalByKebaktianParams{KebaktianID: id, UserID: uid})
		user, _ := r.Context().Value(userObjKey).(sqlc.User)
		rdr.Page(w, r, "kebaktian/detail", map[string]any{
			"Kebaktian": k, "Jadwal": jadwal, "Timezone": user.Timezone,
		})
	}
}

func kebaktianEditForm(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		k, err := q.GetKebaktian(r.Context(), sqlc.GetKebaktianParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		user, _ := r.Context().Value(userObjKey).(sqlc.User)
		form := kebaktianForm{
			Nama:        k.Nama,
			WaktuMulai:  toLocalInput(k.WaktuMulai, user.Timezone),
			Lokasi:      k.Lokasi.String,
			Tema:        k.Tema.String,
			Pengkhotbah: k.Pengkhotbah.String,
			Catatan:     k.Catatan.String,
		}
		rdr.Page(w, r, "kebaktian/form", map[string]any{
			"Form": form, "Errors": map[string]string{}, "IsNew": false, "ID": k.ID,
		})
	}
}

func kebaktianUpdate(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		user, _ := r.Context().Value(userObjKey).(sqlc.User)
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		if _, err := q.GetKebaktian(r.Context(), sqlc.GetKebaktianParams{ID: id, UserID: uid}); errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		if err := r.ParseForm(); err != nil {
			http.Error(w, "Bad Request", http.StatusBadRequest)
			return
		}
		form := kebaktianForm{
			Nama:        FormString(r, "nama"),
			WaktuMulai:  FormString(r, "waktu_mulai"),
			Lokasi:      FormString(r, "lokasi"),
			Tema:        FormString(r, "tema"),
			Pengkhotbah: FormString(r, "pengkhotbah"),
			Catatan:     FormString(r, "catatan"),
		}
		errs := validateKebaktianForm(form)
		waktuUTC, parseErr := ParseLocalDateTime(form.WaktuMulai, user.Timezone)
		if parseErr != nil {
			errs["WaktuMulai"] = "Format waktu tidak valid."
		}
		if len(errs) > 0 {
			w.WriteHeader(http.StatusUnprocessableEntity)
			rdr.Page(w, r, "kebaktian/form", map[string]any{"Form": form, "Errors": errs, "IsNew": false, "ID": id})
			return
		}
		k, err := q.UpdateKebaktian(r.Context(), sqlc.UpdateKebaktianParams{
			ID: id, UserID: uid, Nama: form.Nama, WaktuMulai: waktuUTC,
			Lokasi: nullStr(form.Lokasi), Tema: nullStr(form.Tema),
			Pengkhotbah: nullStr(form.Pengkhotbah), Catatan: nullStr(form.Catatan),
		})
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		SetFlash(w, "Kebaktian berhasil diperbarui.", "success")
		redirectTo := "/kebaktian/" + strconv.FormatInt(k.ID, 10)
		if IsHTMX(r) {
			HXRedirect(w, redirectTo)
			return
		}
		http.Redirect(w, r, redirectTo, http.StatusSeeOther)
	}
}

func kebaktianDelete(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		if err := q.DeleteKebaktian(r.Context(), sqlc.DeleteKebaktianParams{ID: id, UserID: uid}); err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		SetFlash(w, "Kebaktian dihapus.", "success")
		if IsHTMX(r) {
			HXRedirect(w, "/kebaktian")
			return
		}
		http.Redirect(w, r, "/kebaktian", http.StatusSeeOther)
	}
}

func validateKebaktianForm(f kebaktianForm) map[string]string {
	errs := map[string]string{}
	Required(f.Nama, "Nama", errs)
	MaxLen(f.Nama, 200, "Nama", errs)
	Required(f.WaktuMulai, "WaktuMulai", errs)
	MaxLen(f.Lokasi, 200, "Lokasi", errs)
	MaxLen(f.Tema, 300, "Tema", errs)
	MaxLen(f.Pengkhotbah, 200, "Pengkhotbah", errs)
	MaxLen(f.Catatan, 2000, "Catatan", errs)
	return errs
}
