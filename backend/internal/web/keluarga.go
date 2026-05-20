package web

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/thomasbudiarjo/tatagereja/backend/internal/db/sqlc"
)

func mountKeluarga(r chi.Router, q *sqlc.Queries, rdr *Renderer) {
	r.Get("/keluarga", keluargaList(q, rdr))
	r.Get("/keluarga/new", keluargaNewForm(rdr))
	r.Post("/keluarga", keluargaCreate(q, rdr))
	r.Get("/keluarga/{id}", keluargaDetail(q, rdr))
	r.Get("/keluarga/{id}/edit", keluargaEditForm(q, rdr))
	r.Put("/keluarga/{id}", keluargaUpdate(q, rdr))
	r.Post("/keluarga/{id}", keluargaUpdate(q, rdr))
	r.Delete("/keluarga/{id}", keluargaDelete(q, rdr))
	r.Post("/keluarga/{id}/delete", keluargaDelete(q, rdr))
}

type keluargaForm struct {
	NamaKeluarga string
	Alamat       string
	Catatan      string
}

func keluargaList(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		limit, offset := ParsePagination(r)
		items, err := q.ListKeluarga(r.Context(), sqlc.ListKeluargaParams{UserID: uid, Limit: limit, Offset: offset})
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		total, _ := q.CountKeluarga(r.Context(), uid)
		rdr.Page(w, r, "keluarga/list", map[string]any{
			"Items": items, "Total": total, "Limit": limit, "Offset": offset,
		})
	}
}

func keluargaNewForm(rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rdr.Page(w, r, "keluarga/form", map[string]any{
			"Form": keluargaForm{}, "Errors": map[string]string{}, "IsNew": true,
		})
	}
}

func keluargaCreate(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		if err := r.ParseForm(); err != nil {
			http.Error(w, "Bad Request", http.StatusBadRequest)
			return
		}
		form := keluargaForm{
			NamaKeluarga: FormString(r, "nama_keluarga"),
			Alamat:       FormString(r, "alamat"),
			Catatan:      FormString(r, "catatan"),
		}
		errs := validateKeluargaForm(form)
		if len(errs) > 0 {
			w.WriteHeader(http.StatusUnprocessableEntity)
			rdr.Page(w, r, "keluarga/form", map[string]any{"Form": form, "Errors": errs, "IsNew": true})
			return
		}
		k, err := q.CreateKeluarga(r.Context(), sqlc.CreateKeluargaParams{
			UserID: uid, NamaKeluarga: form.NamaKeluarga,
			Alamat: nullStr(form.Alamat), Catatan: nullStr(form.Catatan),
		})
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		SetFlash(w, "Keluarga berhasil ditambahkan.", "success")
		redirectTo := "/keluarga/" + strconv.FormatInt(k.ID, 10)
		if IsHTMX(r) {
			HXRedirect(w, redirectTo)
			return
		}
		http.Redirect(w, r, redirectTo, http.StatusSeeOther)
	}
}

func keluargaDetail(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		k, err := q.GetKeluarga(r.Context(), sqlc.GetKeluargaParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		members, _ := q.ListJemaatByKeluarga(r.Context(), sqlc.ListJemaatByKeluargaParams{UserID: uid, KeluargaID: id})
		rdr.Page(w, r, "keluarga/detail", map[string]any{"Keluarga": k, "Members": members})
	}
}

func keluargaEditForm(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		k, err := q.GetKeluarga(r.Context(), sqlc.GetKeluargaParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		form := keluargaForm{NamaKeluarga: k.NamaKeluarga, Alamat: k.Alamat.String, Catatan: k.Catatan.String}
		rdr.Page(w, r, "keluarga/form", map[string]any{
			"Form": form, "Errors": map[string]string{}, "IsNew": false, "ID": k.ID,
		})
	}
}

func keluargaUpdate(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		if _, err := q.GetKeluarga(r.Context(), sqlc.GetKeluargaParams{ID: id, UserID: uid}); errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		if err := r.ParseForm(); err != nil {
			http.Error(w, "Bad Request", http.StatusBadRequest)
			return
		}
		form := keluargaForm{
			NamaKeluarga: FormString(r, "nama_keluarga"),
			Alamat:       FormString(r, "alamat"),
			Catatan:      FormString(r, "catatan"),
		}
		errs := validateKeluargaForm(form)
		if len(errs) > 0 {
			w.WriteHeader(http.StatusUnprocessableEntity)
			rdr.Page(w, r, "keluarga/form", map[string]any{"Form": form, "Errors": errs, "IsNew": false, "ID": id})
			return
		}
		k, err := q.UpdateKeluarga(r.Context(), sqlc.UpdateKeluargaParams{
			ID: id, UserID: uid, NamaKeluarga: form.NamaKeluarga,
			Alamat: nullStr(form.Alamat), Catatan: nullStr(form.Catatan),
		})
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		SetFlash(w, "Keluarga berhasil diperbarui.", "success")
		redirectTo := "/keluarga/" + strconv.FormatInt(k.ID, 10)
		if IsHTMX(r) {
			HXRedirect(w, redirectTo)
			return
		}
		http.Redirect(w, r, redirectTo, http.StatusSeeOther)
	}
}

func keluargaDelete(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		if err := q.DeleteKeluarga(r.Context(), sqlc.DeleteKeluargaParams{ID: id, UserID: uid}); err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		SetFlash(w, "Keluarga dihapus.", "success")
		if IsHTMX(r) {
			HXRedirect(w, "/keluarga")
			return
		}
		http.Redirect(w, r, "/keluarga", http.StatusSeeOther)
	}
}

func validateKeluargaForm(f keluargaForm) map[string]string {
	errs := map[string]string{}
	Required(f.NamaKeluarga, "NamaKeluarga", errs)
	MaxLen(f.NamaKeluarga, 200, "NamaKeluarga", errs)
	MaxLen(f.Alamat, 500, "Alamat", errs)
	MaxLen(f.Catatan, 2000, "Catatan", errs)
	return errs
}
