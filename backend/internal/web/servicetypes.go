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

type serviceTypeForm struct {
	Nama      string
	Deskripsi string
	Urutan    string
}

type serviceTypeListPage struct {
	Title  string
	User   sqlc.User
	Flash  Flash
	Items  []sqlc.ServiceType
	Form   serviceTypeForm
	Errors map[string]string
}

type serviceTypeRowPage struct {
	User        sqlc.User
	ServiceType sqlc.ServiceType
}

type serviceTypeEditPage struct {
	User   sqlc.User
	Errors map[string]string
	Form   serviceTypeForm
	ID     int64
}

func mountServiceTypes(r chi.Router, q *sqlc.Queries, rdr *Renderer) {
	r.Route("/service-types", func(r chi.Router) {
		r.Get("/", serviceTypeList(q, rdr))
		r.Post("/", serviceTypeCreate(q, rdr))
		r.Get("/{id}/edit", serviceTypeEditFragment(q, rdr))
		r.Put("/{id}", serviceTypeUpdate(q, rdr))
		r.Delete("/{id}", serviceTypeDelete(q, rdr))
	})
}

func serviceTypeList(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		user, err := LoadUser(r.Context(), q, r)
		if err != nil {
			WriteServerError(w, err)
			return
		}
		flash, _ := PopFlash(w, r)
		items, err := q.ListServiceTypes(r.Context(), uid)
		if err != nil {
			WriteServerError(w, err)
			return
		}
		if err := rdr.Page(w, r, "servicetypes/list.html", serviceTypeListPage{
			Title: "Jenis Pelayanan", User: user, Flash: flash, Items: items,
		}); err != nil {
			WriteServerError(w, err)
		}
	}
}

func serviceTypeCreate(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		uid := UserID(r)
		form, params, errs := parseServiceTypeForm(r)
		if len(errs) > 0 {
			w.WriteHeader(http.StatusUnprocessableEntity)
			if IsHTMX(r) {
				_ = rdr.Fragment(w, r, "servicetypes/add_form.html", serviceTypeEditPage{
					User: sqlc.User{}, Errors: errs, Form: form,
				})
				return
			}
			user, uerr := LoadUser(r.Context(), q, r)
			if uerr != nil {
				WriteServerError(w, uerr)
				return
			}
			items, _ := q.ListServiceTypes(r.Context(), uid)
			_ = rdr.Page(w, r, "servicetypes/list.html", serviceTypeListPage{
				Title: "Jenis Pelayanan", User: user, Items: items, Form: form, Errors: errs,
			})
			return
		}
		params.UserID = uid
		row, err := q.CreateServiceType(r.Context(), params)
		if err != nil {
			if IsUniqueViolation(err) {
				w.WriteHeader(http.StatusUnprocessableEntity)
				errs["Nama"] = "Nama sudah digunakan"
				if IsHTMX(r) {
					_ = rdr.Fragment(w, r, "servicetypes/add_form.html", serviceTypeEditPage{Errors: errs, Form: form})
				}
				return
			}
			WriteServerError(w, fmt.Errorf("create service type: %w", err))
			return
		}
		if IsHTMX(r) {
			user, _ := LoadUser(r.Context(), q, r)
			w.WriteHeader(http.StatusOK)
			_ = rdr.Fragment(w, r, "servicetypes/row.html", serviceTypeRowPage{User: user, ServiceType: row})
			return
		}
		RedirectWithFlash(w, r, "/service-types", "Jenis pelayanan berhasil ditambahkan", "success")
	}
}

func serviceTypeEditFragment(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := ParseChiID(r)
		if err != nil {
			WriteNotFound(w)
			return
		}
		st, err := q.GetServiceType(r.Context(), sqlc.GetServiceTypeParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			WriteNotFound(w)
			return
		}
		if err != nil {
			WriteServerError(w, err)
			return
		}
		user, err := LoadUser(r.Context(), q, r)
		if err != nil {
			WriteServerError(w, err)
			return
		}
		if err := rdr.Fragment(w, r, "servicetypes/edit_row.html", serviceTypeEditPage{
			User: user, ID: id, Form: serviceTypeForm{
				Nama: st.Nama, Deskripsi: derefString(st.Deskripsi),
				Urutan: strconv.FormatInt(st.Urutan, 10),
			},
		}); err != nil {
			WriteServerError(w, err)
		}
	}
}

func serviceTypeUpdate(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
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
		form, params, errs := parseServiceTypeForm(r)
		if len(errs) > 0 {
			w.WriteHeader(http.StatusUnprocessableEntity)
			user, _ := LoadUser(r.Context(), q, r)
			_ = rdr.Fragment(w, r, "servicetypes/edit_row.html", serviceTypeEditPage{
				User: user, ID: id, Errors: errs, Form: form,
			})
			return
		}
		row, err := q.UpdateServiceType(r.Context(), sqlc.UpdateServiceTypeParams{
			Nama: params.Nama, Deskripsi: params.Deskripsi, Urutan: params.Urutan,
			ID: id, UserID: uid,
		})
		if errors.Is(err, sql.ErrNoRows) {
			WriteNotFound(w)
			return
		}
		if err != nil {
			if IsUniqueViolation(err) {
				w.WriteHeader(http.StatusUnprocessableEntity)
				errs["Nama"] = "Nama sudah digunakan"
				user, _ := LoadUser(r.Context(), q, r)
				_ = rdr.Fragment(w, r, "servicetypes/edit_row.html", serviceTypeEditPage{
					User: user, ID: id, Errors: errs, Form: form,
				})
				return
			}
			WriteServerError(w, fmt.Errorf("update service type: %w", err))
			return
		}
		if IsHTMX(r) {
			user, _ := LoadUser(r.Context(), q, r)
			_ = rdr.Fragment(w, r, "servicetypes/row.html", serviceTypeRowPage{User: user, ServiceType: row})
			return
		}
		RedirectWithFlash(w, r, "/service-types", "Jenis pelayanan berhasil diperbarui", "success")
	}
}

func serviceTypeDelete(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := ParseChiID(r)
		if err != nil {
			WriteNotFound(w)
			return
		}
		count, err := q.CountJadwalByServiceType(r.Context(), sqlc.CountJadwalByServiceTypeParams{
			ServiceTypeID: id, UserID: uid,
		})
		if err != nil {
			WriteServerError(w, err)
			return
		}
		if count > 0 {
			http.Error(w, "jenis pelayanan masih digunakan di jadwal", http.StatusConflict)
			return
		}
		err = q.DeleteServiceType(r.Context(), sqlc.DeleteServiceTypeParams{ID: id, UserID: uid})
		if err != nil {
			WriteServerError(w, fmt.Errorf("delete service type: %w", err))
			return
		}
		if IsHTMX(r) {
			w.WriteHeader(http.StatusOK)
			return
		}
		RedirectWithFlash(w, r, "/service-types", "Jenis pelayanan berhasil dihapus", "success")
	}
}

func parseServiceTypeForm(r *http.Request) (serviceTypeForm, sqlc.CreateServiceTypeParams, map[string]string) {
	errs := map[string]string{}
	form := serviceTypeForm{
		Nama:      FormString(r, "nama"),
		Deskripsi: FormString(r, "deskripsi"),
		Urutan:    FormString(r, "urutan"),
	}
	Required(form.Nama, "Nama", errs)
	MaxLen(form.Nama, 100, "Nama", errs)
	MaxLen(form.Deskripsi, 500, "Deskripsi", errs)
	urutan := int64(0)
	if form.Urutan != "" {
		n, err := strconv.ParseInt(form.Urutan, 10, 64)
		if err != nil {
			errs["Urutan"] = "Urutan harus angka"
		} else {
			urutan = n
		}
	}
	return form, sqlc.CreateServiceTypeParams{
		Nama: form.Nama, Deskripsi: NullStringFromForm(form.Deskripsi), Urutan: urutan,
	}, errs
}
