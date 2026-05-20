package web

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/thomasbudiarjo/tatagereja/backend/internal/db/sqlc"
)

func mountPelayan(r chi.Router, q *sqlc.Queries, database *sql.DB, rdr *Renderer) {
	r.Get("/pelayan", pelayanList(q, rdr))
	r.Get("/pelayan/new", pelayanNewForm(q, rdr))
	r.Post("/pelayan", pelayanCreate(q, database, rdr))
	r.Get("/pelayan/{id}", pelayanDetail(q, rdr))
	r.Get("/pelayan/{id}/edit", pelayanEditForm(q, rdr))
	r.Put("/pelayan/{id}", pelayanUpdate(q, database, rdr))
	r.Post("/pelayan/{id}", pelayanUpdate(q, database, rdr))
	r.Delete("/pelayan/{id}", pelayanDelete(q, rdr))
	r.Post("/pelayan/{id}/delete", pelayanDelete(q, rdr))
}

type pelayanForm struct {
	JemaatID       string
	Catatan        string
	ServiceTypeIDs []string
}

func pelayanList(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		items, err := q.ListPelayan(r.Context(), uid)
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		type pelayanItem struct {
			sqlc.PelayanRow
			ServiceTypes []sqlc.ServiceType
		}
		var enriched []pelayanItem
		for _, p := range items {
			sts, _ := q.GetPelayanServiceTypes(r.Context(), p.ID)
			enriched = append(enriched, pelayanItem{PelayanRow: p, ServiceTypes: sts})
		}
		rdr.Page(w, r, "pelayan/list", map[string]any{"Items": enriched})
	}
}

func pelayanNewForm(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		jemaats, _ := q.ListAllActiveJemaat(r.Context(), uid)
		serviceTypes, _ := q.ListServiceTypes(r.Context(), uid)
		rdr.Page(w, r, "pelayan/form", map[string]any{
			"Form": pelayanForm{}, "Errors": map[string]string{},
			"Jemaats": jemaats, "ServiceTypes": serviceTypes, "IsNew": true,
		})
	}
}

func pelayanCreate(q *sqlc.Queries, database *sql.DB, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		if err := r.ParseForm(); err != nil {
			http.Error(w, "Bad Request", http.StatusBadRequest)
			return
		}
		form := pelayanForm{
			JemaatID:       FormString(r, "jemaat_id"),
			Catatan:        FormString(r, "catatan"),
			ServiceTypeIDs: r.Form["service_type_ids"],
		}
		errs := validatePelayanForm(r.Context(), q, uid, form, 0)
		if len(errs) > 0 {
			jemaats, _ := q.ListAllActiveJemaat(r.Context(), uid)
			serviceTypes, _ := q.ListServiceTypes(r.Context(), uid)
			w.WriteHeader(http.StatusUnprocessableEntity)
			rdr.Page(w, r, "pelayan/form", map[string]any{
				"Form": form, "Errors": errs, "Jemaats": jemaats, "ServiceTypes": serviceTypes, "IsNew": true,
			})
			return
		}
		jemaatID, _ := strconv.ParseInt(form.JemaatID, 10, 64)
		tx, err := database.BeginTx(r.Context(), nil)
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()
		qtx := q.WithTx(tx)
		p, err := qtx.CreatePelayan(r.Context(), sqlc.CreatePelayanParams{
			UserID: uid, JemaatID: jemaatID, Catatan: nullStr(form.Catatan),
		})
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		for _, stIDStr := range form.ServiceTypeIDs {
			stID, _ := strconv.ParseInt(stIDStr, 10, 64)
			if err := qtx.AddPelayanServiceType(r.Context(), sqlc.AddPelayanServiceTypeParams{
				PelayanID: p.ID, ServiceTypeID: stID,
			}); err != nil {
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
				return
			}
		}
		if err := tx.Commit(); err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		SetFlash(w, "Pelayan berhasil ditambahkan.", "success")
		redirectTo := "/pelayan/" + strconv.FormatInt(p.ID, 10)
		if IsHTMX(r) {
			HXRedirect(w, redirectTo)
			return
		}
		http.Redirect(w, r, redirectTo, http.StatusSeeOther)
	}
}

func pelayanDetail(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		p, err := q.GetPelayan(r.Context(), sqlc.GetPelayanParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		serviceTypes, _ := q.GetPelayanServiceTypes(r.Context(), p.ID)
		rdr.Page(w, r, "pelayan/detail", map[string]any{"Pelayan": p, "ServiceTypes": serviceTypes})
	}
}

func pelayanEditForm(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		p, err := q.GetPelayan(r.Context(), sqlc.GetPelayanParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		existingSTs, _ := q.GetPelayanServiceTypes(r.Context(), p.ID)
		stIDs := make([]string, len(existingSTs))
		for i, st := range existingSTs {
			stIDs[i] = strconv.FormatInt(st.ID, 10)
		}
		form := pelayanForm{
			JemaatID:       strconv.FormatInt(p.JemaatID, 10),
			Catatan:        p.Catatan.String,
			ServiceTypeIDs: stIDs,
		}
		jemaats, _ := q.ListAllActiveJemaat(r.Context(), uid)
		serviceTypes, _ := q.ListServiceTypes(r.Context(), uid)
		rdr.Page(w, r, "pelayan/form", map[string]any{
			"Form": form, "Errors": map[string]string{}, "Jemaats": jemaats,
			"ServiceTypes": serviceTypes, "IsNew": false, "ID": p.ID,
		})
	}
}

func pelayanUpdate(q *sqlc.Queries, database *sql.DB, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		if _, err := q.GetPelayan(r.Context(), sqlc.GetPelayanParams{ID: id, UserID: uid}); errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		if err := r.ParseForm(); err != nil {
			http.Error(w, "Bad Request", http.StatusBadRequest)
			return
		}
		form := pelayanForm{
			JemaatID:       FormString(r, "jemaat_id"),
			Catatan:        FormString(r, "catatan"),
			ServiceTypeIDs: r.Form["service_type_ids"],
		}
		errs := validatePelayanForm(r.Context(), q, uid, form, id)
		if len(errs) > 0 {
			jemaats, _ := q.ListAllActiveJemaat(r.Context(), uid)
			serviceTypes, _ := q.ListServiceTypes(r.Context(), uid)
			w.WriteHeader(http.StatusUnprocessableEntity)
			rdr.Page(w, r, "pelayan/form", map[string]any{
				"Form": form, "Errors": errs, "Jemaats": jemaats, "ServiceTypes": serviceTypes, "IsNew": false, "ID": id,
			})
			return
		}
		tx, err := database.BeginTx(r.Context(), nil)
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()
		qtx := q.WithTx(tx)
		p, err := qtx.UpdatePelayan(r.Context(), sqlc.UpdatePelayanParams{
			ID: id, UserID: uid, Catatan: nullStr(form.Catatan),
		})
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		_ = qtx.SetPelayanServiceTypes(r.Context(), p.ID)
		for _, stIDStr := range form.ServiceTypeIDs {
			stID, _ := strconv.ParseInt(stIDStr, 10, 64)
			_ = qtx.AddPelayanServiceType(r.Context(), sqlc.AddPelayanServiceTypeParams{
				PelayanID: p.ID, ServiceTypeID: stID,
			})
		}
		if err := tx.Commit(); err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		SetFlash(w, "Pelayan berhasil diperbarui.", "success")
		redirectTo := "/pelayan/" + strconv.FormatInt(p.ID, 10)
		if IsHTMX(r) {
			HXRedirect(w, redirectTo)
			return
		}
		http.Redirect(w, r, redirectTo, http.StatusSeeOther)
	}
}

func pelayanDelete(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		if err := q.DeletePelayan(r.Context(), sqlc.DeletePelayanParams{ID: id, UserID: uid}); err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		SetFlash(w, "Pelayan dihapus.", "success")
		if IsHTMX(r) {
			HXRedirect(w, "/pelayan")
			return
		}
		http.Redirect(w, r, "/pelayan", http.StatusSeeOther)
	}
}

func validatePelayanForm(_ any, _ *sqlc.Queries, _ int64, f pelayanForm, _ int64) map[string]string {
	errs := map[string]string{}
	Required(f.JemaatID, "JemaatID", errs)
	MaxLen(f.Catatan, 2000, "Catatan", errs)
	return errs
}
