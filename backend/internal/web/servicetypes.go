package web

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/thomasbudiarjo/tatagereja/backend/internal/db/sqlc"
)

func mountServiceTypes(r chi.Router, q *sqlc.Queries, rdr *Renderer) {
	r.Get("/service-types", serviceTypeList(q, rdr))
	r.Post("/service-types", serviceTypeCreate(q, rdr))
	r.Get("/service-types/{id}/edit", serviceTypeEditFragment(q, rdr))
	r.Put("/service-types/{id}", serviceTypeUpdate(q, rdr))
	r.Post("/service-types/{id}", serviceTypeUpdate(q, rdr))
	r.Delete("/service-types/{id}", serviceTypeDelete(q, rdr))
	r.Post("/service-types/{id}/delete", serviceTypeDelete(q, rdr))
}

type serviceTypeForm struct {
	Nama      string
	Deskripsi string
	Urutan    string
}

func serviceTypeList(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		items, err := q.ListServiceTypes(r.Context(), uid)
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		rdr.Page(w, r, "servicetypes/list", map[string]any{
			"Items":  items,
			"Form":   serviceTypeForm{},
			"Errors": map[string]string{},
		})
	}
}

func serviceTypeCreate(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		if err := r.ParseForm(); err != nil {
			http.Error(w, "Bad Request", http.StatusBadRequest)
			return
		}
		form := serviceTypeForm{
			Nama:      FormString(r, "nama"),
			Deskripsi: FormString(r, "deskripsi"),
			Urutan:    FormString(r, "urutan"),
		}
		errs := validateServiceTypeForm(form)
		if len(errs) > 0 {
			items, _ := q.ListServiceTypes(r.Context(), uid)
			w.WriteHeader(http.StatusUnprocessableEntity)
			rdr.Page(w, r, "servicetypes/list", map[string]any{"Items": items, "Form": form, "Errors": errs})
			return
		}
		urutan, _ := strconv.ParseInt(form.Urutan, 10, 64)
		_, err := q.CreateServiceType(r.Context(), sqlc.CreateServiceTypeParams{
			UserID: uid, Nama: form.Nama, Deskripsi: nullStr(form.Deskripsi), Urutan: urutan,
		})
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		SetFlash(w, "Tipe pelayanan ditambahkan.", "success")
		if IsHTMX(r) {
			HXRedirect(w, "/service-types")
			return
		}
		http.Redirect(w, r, "/service-types", http.StatusSeeOther)
	}
}

func serviceTypeEditFragment(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		st, err := q.GetServiceType(r.Context(), sqlc.GetServiceTypeParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		form := serviceTypeForm{
			Nama:      st.Nama,
			Deskripsi: st.Deskripsi.String,
			Urutan:    strconv.FormatInt(st.Urutan, 10),
		}
		rdr.Fragment(w, r, "servicetypes/edit_row", map[string]any{"Form": form, "Errors": map[string]string{}, "ID": st.ID})
	}
}

func serviceTypeUpdate(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		if _, err := q.GetServiceType(r.Context(), sqlc.GetServiceTypeParams{ID: id, UserID: uid}); errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		if err := r.ParseForm(); err != nil {
			http.Error(w, "Bad Request", http.StatusBadRequest)
			return
		}
		form := serviceTypeForm{
			Nama:      FormString(r, "nama"),
			Deskripsi: FormString(r, "deskripsi"),
			Urutan:    FormString(r, "urutan"),
		}
		errs := validateServiceTypeForm(form)
		if len(errs) > 0 {
			w.WriteHeader(http.StatusUnprocessableEntity)
			rdr.Fragment(w, r, "servicetypes/edit_row", map[string]any{"Form": form, "Errors": errs, "ID": id})
			return
		}
		urutan, _ := strconv.ParseInt(form.Urutan, 10, 64)
		_, err = q.UpdateServiceType(r.Context(), sqlc.UpdateServiceTypeParams{
			ID: id, UserID: uid, Nama: form.Nama, Deskripsi: nullStr(form.Deskripsi), Urutan: urutan,
		})
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		SetFlash(w, "Tipe pelayanan diperbarui.", "success")
		if IsHTMX(r) {
			HXRedirect(w, "/service-types")
			return
		}
		http.Redirect(w, r, "/service-types", http.StatusSeeOther)
	}
}

func serviceTypeDelete(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		if err := q.DeleteServiceType(r.Context(), sqlc.DeleteServiceTypeParams{ID: id, UserID: uid}); err != nil {
			// FK constraint = 409 Conflict
			http.Error(w, "Tipe pelayanan masih digunakan.", http.StatusConflict)
			return
		}
		SetFlash(w, "Tipe pelayanan dihapus.", "success")
		if IsHTMX(r) {
			HXRedirect(w, "/service-types")
			return
		}
		http.Redirect(w, r, "/service-types", http.StatusSeeOther)
	}
}

func validateServiceTypeForm(f serviceTypeForm) map[string]string {
	errs := map[string]string{}
	Required(f.Nama, "Nama", errs)
	MaxLen(f.Nama, 100, "Nama", errs)
	MaxLen(f.Deskripsi, 500, "Deskripsi", errs)
	return errs
}
