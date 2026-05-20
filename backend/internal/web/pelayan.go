package web

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/tatagereja/tatagereja/backend/internal/db/sqlc"
)

type pelayanForm struct {
	JemaatID         string
	Catatan          string
	ServiceTypeIDs   []int64
	ServiceTypeCheck map[int64]bool
}

type pelayanListRow struct {
	sqlc.ListPelayanRow
	ServiceTypes []string
}

type pelayanListPage struct {
	Title string
	User  sqlc.User
	Flash Flash
	Items []pelayanListRow
}

type pelayanDetailPage struct {
	Title         string
	User          sqlc.User
	Flash         Flash
	Pelayan       sqlc.Pelayan
	JemaatNama    string
	ServiceTypes  []string
}

type pelayanFormPage struct {
	Title        string
	User         sqlc.User
	Flash        Flash
	Errors       map[string]string
	Form         pelayanForm
	PelayanID    int64
	Jemaat       []sqlc.ListActiveJemaatNamesRow
	ServiceTypes []sqlc.ServiceType
	IsEdit       bool
}

func mountPelayan(r chi.Router, q *sqlc.Queries, db *sql.DB, rdr *Renderer) {
	r.Route("/pelayan", func(r chi.Router) {
		r.Get("/", pelayanList(q, rdr))
		r.Get("/new", pelayanNewForm(q, rdr))
		r.Post("/", pelayanCreate(q, db, rdr))
		r.Get("/{id}", pelayanDetail(q, rdr))
		r.Get("/{id}/edit", pelayanEditForm(q, rdr))
		r.Put("/{id}", pelayanUpdate(q, db, rdr))
		r.Delete("/{id}", pelayanDelete(q, rdr))
	})
}

func pelayanList(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		user, err := LoadUser(r.Context(), q, r)
		if err != nil {
			WriteServerError(w, err)
			return
		}
		flash, _ := PopFlash(w, r)
		rows, err := q.ListPelayan(r.Context(), uid)
		if err != nil {
			WriteServerError(w, err)
			return
		}
		items := make([]pelayanListRow, 0, len(rows))
		for _, row := range rows {
			names, err := q.ListPelayanServiceTypeNames(r.Context(), row.ID)
			if err != nil {
				WriteServerError(w, err)
				return
			}
			items = append(items, pelayanListRow{ListPelayanRow: row, ServiceTypes: names})
		}
		if err := rdr.Page(w, r, "pelayan/list.html", pelayanListPage{
			Title: "Pelayan", User: user, Flash: flash, Items: items,
		}); err != nil {
			WriteServerError(w, err)
		}
	}
}

func pelayanNewForm(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		renderPelayanForm(w, r, q, rdr, 0, pelayanForm{}, map[string]string{}, false)
	}
}

func pelayanEditForm(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := ParseChiID(r)
		if err != nil {
			WriteNotFound(w)
			return
		}
		p, err := q.GetPelayan(r.Context(), sqlc.GetPelayanParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			WriteNotFound(w)
			return
		}
		if err != nil {
			WriteServerError(w, err)
			return
		}
		stIDs, err := q.ListPelayanServiceTypeIDs(r.Context(), id)
		if err != nil {
			WriteServerError(w, err)
			return
		}
		checks := map[int64]bool{}
		for _, sid := range stIDs {
			checks[sid] = true
		}
		renderPelayanForm(w, r, q, rdr, id, pelayanForm{
			JemaatID:         fmt.Sprintf("%d", p.JemaatID),
			Catatan:          derefString(p.Catatan),
			ServiceTypeIDs:   stIDs,
			ServiceTypeCheck: checks,
		}, map[string]string{}, true)
	}
}

func pelayanCreate(q *sqlc.Queries, db *sql.DB, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		uid := UserID(r)
		form, jemaatID, stIDs, errs := parsePelayanForm(r, q, uid)
		if len(errs) > 0 {
			w.WriteHeader(http.StatusUnprocessableEntity)
			renderPelayanForm(w, r, q, rdr, 0, form, errs, false)
			return
		}
		row, err := createPelayanWithTypes(r.Context(), db, q, uid, jemaatID, form.Catatan, stIDs)
		if err != nil {
			WriteServerError(w, err)
			return
		}
		RedirectWithFlash(w, r, fmt.Sprintf("/pelayan/%d", row.ID), "Pelayan berhasil ditambahkan", "success")
	}
}

func pelayanUpdate(q *sqlc.Queries, db *sql.DB, rdr *Renderer) http.HandlerFunc {
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
		form, jemaatID, stIDs, errs := parsePelayanForm(r, q, uid)
		if len(errs) > 0 {
			w.WriteHeader(http.StatusUnprocessableEntity)
			renderPelayanForm(w, r, q, rdr, id, form, errs, true)
			return
		}
		if err := updatePelayanWithTypes(r.Context(), db, q, uid, id, jemaatID, form.Catatan, stIDs); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				WriteNotFound(w)
				return
			}
			WriteServerError(w, err)
			return
		}
		RedirectWithFlash(w, r, fmt.Sprintf("/pelayan/%d", id), "Pelayan berhasil diperbarui", "success")
	}
}

func pelayanDelete(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := ParseChiID(r)
		if err != nil {
			WriteNotFound(w)
			return
		}
		err = q.DeletePelayan(r.Context(), sqlc.DeletePelayanParams{ID: id, UserID: uid})
		if err != nil {
			WriteServerError(w, fmt.Errorf("delete pelayan: %w", err))
			return
		}
		if IsHTMX(r) {
			w.WriteHeader(http.StatusOK)
			return
		}
		RedirectWithFlash(w, r, "/pelayan", "Pelayan berhasil dihapus", "success")
	}
}

func pelayanDetail(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
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
		p, err := q.GetPelayan(r.Context(), sqlc.GetPelayanParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			WriteNotFound(w)
			return
		}
		if err != nil {
			WriteServerError(w, err)
			return
		}
		j, err := q.GetJemaat(r.Context(), sqlc.GetJemaatParams{ID: p.JemaatID, UserID: uid})
		if err != nil {
			WriteServerError(w, err)
			return
		}
		stNames, err := q.ListPelayanServiceTypeNames(r.Context(), id)
		if err != nil {
			WriteServerError(w, err)
			return
		}
		if err := rdr.Page(w, r, "pelayan/detail.html", pelayanDetailPage{
			Title: j.NamaLengkap, User: user, Flash: flash,
			Pelayan: p, JemaatNama: j.NamaLengkap, ServiceTypes: stNames,
		}); err != nil {
			WriteServerError(w, err)
		}
	}
}

func renderPelayanForm(w http.ResponseWriter, r *http.Request, q *sqlc.Queries, rdr *Renderer, id int64, form pelayanForm, errs map[string]string, isEdit bool) {
	uid := UserID(r)
	user, err := LoadUser(r.Context(), q, r)
	if err != nil {
		WriteServerError(w, err)
		return
	}
	flash, _ := PopFlash(w, r)
	jemaat, err := q.ListActiveJemaatNames(r.Context(), uid)
	if err != nil {
		WriteServerError(w, err)
		return
	}
	st, err := q.ListServiceTypes(r.Context(), uid)
	if err != nil {
		WriteServerError(w, err)
		return
	}
	if form.ServiceTypeCheck == nil {
		form.ServiceTypeCheck = map[int64]bool{}
		for _, sid := range form.ServiceTypeIDs {
			form.ServiceTypeCheck[sid] = true
		}
	}
	title := "Tambah Pelayan"
	if isEdit {
		title = "Edit Pelayan"
	}
	if err := rdr.Page(w, r, "pelayan/form.html", pelayanFormPage{
		Title: title, User: user, Flash: flash, Errors: errs, Form: form,
		PelayanID: id, Jemaat: jemaat, ServiceTypes: st, IsEdit: isEdit,
	}); err != nil {
		WriteServerError(w, err)
	}
}

func parsePelayanForm(r *http.Request, q *sqlc.Queries, uid int64) (pelayanForm, int64, []int64, map[string]string) {
	errs := map[string]string{}
	form := pelayanForm{
		JemaatID: FormString(r, "jemaat_id"),
		Catatan:  FormString(r, "catatan"),
	}
	stIDs := FormCheckboxIDs(r, "service_type_ids")
	form.ServiceTypeIDs = stIDs
	checks := map[int64]bool{}
	for _, id := range stIDs {
		checks[id] = true
	}
	form.ServiceTypeCheck = checks

	MaxLen(form.Catatan, 2000, "Catatan", errs)
	if form.JemaatID == "" {
		errs["JemaatID"] = "Wajib diisi"
	}
	var jemaatID int64
	if form.JemaatID != "" {
		var err error
		jemaatID, err = strconv.ParseInt(form.JemaatID, 10, 64)
		if err != nil {
			errs["JemaatID"] = "Jemaat tidak valid"
		} else {
			_, err = q.GetJemaat(r.Context(), sqlc.GetJemaatParams{ID: jemaatID, UserID: uid})
			if errors.Is(err, sql.ErrNoRows) {
				errs["JemaatID"] = "Jemaat tidak ditemukan"
			} else if err != nil {
				errs["JemaatID"] = "Jemaat tidak valid"
			}
		}
	}
	for _, sid := range stIDs {
		_, err := q.GetServiceType(r.Context(), sqlc.GetServiceTypeParams{ID: sid, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			errs["ServiceTypeIDs"] = "Jenis pelayanan tidak valid"
			break
		} else if err != nil {
			errs["ServiceTypeIDs"] = "Jenis pelayanan tidak valid"
			break
		}
	}
	return form, jemaatID, stIDs, errs
}

func createPelayanWithTypes(ctx context.Context, db *sql.DB, q *sqlc.Queries, uid, jemaatID int64, catatan string, stIDs []int64) (sqlc.Pelayan, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return sqlc.Pelayan{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	tq := q.WithTx(tx)
	row, err := tq.CreatePelayan(ctx, sqlc.CreatePelayanParams{
		UserID: uid, JemaatID: jemaatID, Catatan: NullStringFromForm(catatan),
	})
	if err != nil {
		return sqlc.Pelayan{}, fmt.Errorf("create pelayan: %w", err)
	}
	for _, sid := range stIDs {
		if err := tq.InsertPelayanServiceType(ctx, sqlc.InsertPelayanServiceTypeParams{
			PelayanID: row.ID, ServiceTypeID: sid,
		}); err != nil {
			return sqlc.Pelayan{}, fmt.Errorf("insert pelayan service type: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return sqlc.Pelayan{}, fmt.Errorf("commit: %w", err)
	}
	return row, nil
}

func updatePelayanWithTypes(ctx context.Context, db *sql.DB, q *sqlc.Queries, uid, id, jemaatID int64, catatan string, stIDs []int64) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	tq := q.WithTx(tx)
	_, err = tq.UpdatePelayan(ctx, sqlc.UpdatePelayanParams{
		JemaatID: jemaatID,
		Catatan:  NullStringFromForm(catatan),
		ID:       id,
		UserID:   uid,
	})
	if errors.Is(err, sql.ErrNoRows) {
		return sql.ErrNoRows
	}
	if err != nil {
		return fmt.Errorf("update pelayan: %w", err)
	}
	if err := tq.DeletePelayanServiceTypes(ctx, id); err != nil {
		return fmt.Errorf("delete pelayan service types: %w", err)
	}
	for _, sid := range stIDs {
		if err := tq.InsertPelayanServiceType(ctx, sqlc.InsertPelayanServiceTypeParams{
			PelayanID: id, ServiceTypeID: sid,
		}); err != nil {
			return fmt.Errorf("insert pelayan service type: %w", err)
		}
	}
	return tx.Commit()
}
