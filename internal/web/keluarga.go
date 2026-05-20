package web

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/tatagereja/tatagereja/internal/db/sqlc"
)

type keluargaForm struct {
	NamaKeluarga string
	Alamat       string
	Catatan      string
}

type keluargaListPage struct {
	Title string
	User  sqlc.User
	Flash Flash
	Items []sqlc.Keluarga
}

type keluargaDetailPage struct {
	Title   string
	User    sqlc.User
	Flash   Flash
	Keluarga sqlc.Keluarga
	Members []sqlc.Jemaat
}

type keluargaFormPage struct {
	Title      string
	User       sqlc.User
	Flash      Flash
	Errors     map[string]string
	Form       keluargaForm
	KeluargaID int64
	IsEdit     bool
}

func mountKeluarga(r chi.Router, q *sqlc.Queries, rdr *Renderer) {
	r.Route("/keluarga", func(r chi.Router) {
		r.Get("/", keluargaList(q, rdr))
		r.Get("/new", keluargaNewForm(q, rdr))
		r.Post("/", keluargaCreate(q, rdr))
		r.Get("/{id}", keluargaDetail(q, rdr))
		r.Get("/{id}/edit", keluargaEditForm(q, rdr))
		r.Put("/{id}", keluargaUpdate(q, rdr))
		r.Delete("/{id}", keluargaDelete(q, rdr))
	})
}

func keluargaList(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		user, err := LoadUser(r.Context(), q, r)
		if err != nil {
			WriteServerError(w, err)
			return
		}
		flash, _ := PopFlash(w, r)
		items, err := q.ListKeluarga(r.Context(), uid)
		if err != nil {
			WriteServerError(w, err)
			return
		}
		if err := rdr.Page(w, r, "keluarga/list.html", keluargaListPage{
			Title: "Keluarga", User: user, Flash: flash, Items: items,
		}); err != nil {
			WriteServerError(w, err)
		}
	}
}

func keluargaNewForm(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		renderKeluargaForm(w, r, q, rdr, 0, keluargaForm{}, map[string]string{}, false)
	}
}

func keluargaEditForm(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := ParseChiID(r)
		if err != nil {
			WriteNotFound(w)
			return
		}
		k, err := q.GetKeluarga(r.Context(), sqlc.GetKeluargaParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			WriteNotFound(w)
			return
		}
		if err != nil {
			WriteServerError(w, err)
			return
		}
		renderKeluargaForm(w, r, q, rdr, id, keluargaForm{
			NamaKeluarga: k.NamaKeluarga,
			Alamat:       derefString(k.Alamat),
			Catatan:      derefString(k.Catatan),
		}, map[string]string{}, true)
	}
}

func keluargaCreate(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		uid := UserID(r)
		form, params, errs := parseKeluargaForm(r)
		if len(errs) > 0 {
			w.WriteHeader(http.StatusUnprocessableEntity)
			renderKeluargaForm(w, r, q, rdr, 0, form, errs, false)
			return
		}
		params.UserID = uid
		row, err := q.CreateKeluarga(r.Context(), params)
		if err != nil {
			WriteServerError(w, fmt.Errorf("create keluarga: %w", err))
			return
		}
		RedirectWithFlash(w, r, fmt.Sprintf("/keluarga/%d", row.ID), "Keluarga berhasil ditambahkan", "success")
	}
}

func keluargaUpdate(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
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
		form, params, errs := parseKeluargaForm(r)
		if len(errs) > 0 {
			w.WriteHeader(http.StatusUnprocessableEntity)
			renderKeluargaForm(w, r, q, rdr, id, form, errs, true)
			return
		}
		_, err = q.UpdateKeluarga(r.Context(), sqlc.UpdateKeluargaParams{
			NamaKeluarga: params.NamaKeluarga,
			Alamat:       params.Alamat,
			Catatan:      params.Catatan,
			ID:           id,
			UserID:       uid,
		})
		if errors.Is(err, sql.ErrNoRows) {
			WriteNotFound(w)
			return
		}
		if err != nil {
			WriteServerError(w, fmt.Errorf("update keluarga: %w", err))
			return
		}
		RedirectWithFlash(w, r, fmt.Sprintf("/keluarga/%d", id), "Keluarga berhasil diperbarui", "success")
	}
}

func keluargaDelete(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := ParseChiID(r)
		if err != nil {
			WriteNotFound(w)
			return
		}
		err = q.DeleteKeluarga(r.Context(), sqlc.DeleteKeluargaParams{ID: id, UserID: uid})
		if err != nil {
			WriteServerError(w, fmt.Errorf("delete keluarga: %w", err))
			return
		}
		if IsHTMX(r) {
			w.WriteHeader(http.StatusOK)
			return
		}
		RedirectWithFlash(w, r, "/keluarga", "Keluarga berhasil dihapus", "success")
	}
}

func keluargaDetail(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
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
		k, err := q.GetKeluarga(r.Context(), sqlc.GetKeluargaParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			WriteNotFound(w)
			return
		}
		if err != nil {
			WriteServerError(w, err)
			return
		}
		members, err := q.ListJemaatByKeluarga(r.Context(), sqlc.ListJemaatByKeluargaParams{
			UserID: uid, KeluargaID: sql.NullInt64{Int64: id, Valid: true},
		})
		if err != nil {
			WriteServerError(w, err)
			return
		}
		if err := rdr.Page(w, r, "keluarga/detail.html", keluargaDetailPage{
			Title: k.NamaKeluarga, User: user, Flash: flash, Keluarga: k, Members: members,
		}); err != nil {
			WriteServerError(w, err)
		}
	}
}

func renderKeluargaForm(w http.ResponseWriter, r *http.Request, q *sqlc.Queries, rdr *Renderer, id int64, form keluargaForm, errs map[string]string, isEdit bool) {
	user, err := LoadUser(r.Context(), q, r)
	if err != nil {
		WriteServerError(w, err)
		return
	}
	flash, _ := PopFlash(w, r)
	title := "Tambah Keluarga"
	if isEdit {
		title = "Edit Keluarga"
	}
	if err := rdr.Page(w, r, "keluarga/form.html", keluargaFormPage{
		Title: title, User: user, Flash: flash, Errors: errs, Form: form,
		KeluargaID: id, IsEdit: isEdit,
	}); err != nil {
		WriteServerError(w, err)
	}
}

func parseKeluargaForm(r *http.Request) (keluargaForm, sqlc.CreateKeluargaParams, map[string]string) {
	errs := map[string]string{}
	form := keluargaForm{
		NamaKeluarga: FormString(r, "nama_keluarga"),
		Alamat:       FormString(r, "alamat"),
		Catatan:      FormString(r, "catatan"),
	}
	Required(form.NamaKeluarga, "NamaKeluarga", errs)
	MaxLen(form.NamaKeluarga, 200, "NamaKeluarga", errs)
	MaxLen(form.Alamat, 500, "Alamat", errs)
	MaxLen(form.Catatan, 2000, "Catatan", errs)
	return form, sqlc.CreateKeluargaParams{
		NamaKeluarga: form.NamaKeluarga,
		Alamat:       NullStringFromForm(form.Alamat),
		Catatan:      NullStringFromForm(form.Catatan),
	}, errs
}
