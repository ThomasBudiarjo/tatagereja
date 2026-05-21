package web

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/tatagereja/tatagereja/internal/db/sqlc"
)

type kebaktianForm struct {
	Nama        string
	WaktuMulai  string
	Lokasi      string
	Tema        string
	Pengkhotbah string
	Catatan     string
}

type kebaktianListPage struct {
	Title  string
	User   sqlc.User
	Flash  Flash
	TZ     string
	Items  []sqlc.Kebaktian
	From   string
	To     string
	Limit  int64
	Offset int64
}

type kebaktianDetailPage struct {
	Title     string
	User      sqlc.User
	Flash     Flash
	TZ        string
	Kebaktian sqlc.Kebaktian
	Jadwal    []sqlc.ListJadwalByKebaktianRow
}

type kebaktianFormPage struct {
	Title       string
	User        sqlc.User
	Flash       Flash
	TZ          string
	Errors      map[string]string
	Form        kebaktianForm
	KebaktianID int64
	IsEdit      bool
}

func mountKebaktian(r chi.Router, q *sqlc.Queries, rdr *Renderer) {
	r.Route("/kebaktian", func(r chi.Router) {
		r.Get("/", kebaktianList(q, rdr))
		r.Get("/new", kebaktianNewForm(q, rdr))
		r.Post("/", kebaktianCreate(q, rdr))
		r.Get("/{id}", kebaktianDetail(q, rdr))
		r.Get("/{id}/edit", kebaktianEditForm(q, rdr))
		r.Put("/{id}", kebaktianUpdate(q, rdr))
		r.Delete("/{id}", kebaktianDelete(q, rdr))
	})
}

func kebaktianList(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		user, err := LoadUser(r.Context(), q, r)
		if err != nil {
			WriteServerError(w, err)
			return
		}
		flash, _ := PopFlash(w, r)
		from := r.URL.Query().Get("from")
		to := r.URL.Query().Get("to")
		limit, offset := ParsePagination(r)

		var items []sqlc.Kebaktian
		var listErr error
		if from != "" || to != "" {
			startUTC, endUTC, rangeErr := DateRangeUTC(from, to, user.Timezone)
			if rangeErr != nil {
				WriteServerError(w, rangeErr)
				return
			}
			if from == "" {
				startUTC = "1970-01-01T00:00:00.000000Z"
			}
			if to == "" {
				endUTC = "9999-12-31T23:59:59.999999Z"
			}
			items, listErr = q.ListKebaktianRange(r.Context(), sqlc.ListKebaktianRangeParams{
				UserID: uid, WaktuMulai: startUTC, WaktuMulai_2: endUTC,
			})
		} else {
			items, listErr = q.ListKebaktian(r.Context(), sqlc.ListKebaktianParams{
				UserID: uid, Limit: limit, Offset: offset,
			})
		}
		if listErr != nil {
			WriteServerError(w, listErr)
			return
		}
		if err := rdr.Page(w, r, "kebaktian/list.html", kebaktianListPage{
			Title: "Kebaktian", User: user, Flash: flash, TZ: user.Timezone, Items: items,
			From: from, To: to, Limit: limit, Offset: offset,
		}); err != nil {
			WriteServerError(w, err)
		}
	}
}

func kebaktianNewForm(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		renderKebaktianForm(w, r, q, rdr, 0, kebaktianForm{}, map[string]string{}, false)
	}
}

func kebaktianEditForm(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		user, err := LoadUser(r.Context(), q, r)
		if err != nil {
			WriteServerError(w, err)
			return
		}
		id, err := ParseChiID(r)
		if err != nil {
			WriteNotFound(w)
			return
		}
		k, err := q.GetKebaktian(r.Context(), sqlc.GetKebaktianParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			WriteNotFound(w)
			return
		}
		if err != nil {
			WriteServerError(w, err)
			return
		}
		renderKebaktianForm(w, r, q, rdr, id, kebaktianForm{
			Nama:        k.Nama,
			WaktuMulai:  toLocalInput(k.WaktuMulai, user.Timezone),
			Lokasi:      derefString(k.Lokasi),
			Tema:        derefString(k.Tema),
			Pengkhotbah: derefString(k.Pengkhotbah),
			Catatan:     derefString(k.Catatan),
		}, map[string]string{}, true)
	}
}

func kebaktianCreate(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		uid := UserID(r)
		user, err := LoadUser(r.Context(), q, r)
		if err != nil {
			WriteServerError(w, err)
			return
		}
		form, params, errs := parseKebaktianForm(r, user.Timezone)
		if len(errs) > 0 {
			w.WriteHeader(http.StatusUnprocessableEntity)
			renderKebaktianForm(w, r, q, rdr, 0, form, errs, false)
			return
		}
		params.UserID = uid
		row, err := q.CreateKebaktian(r.Context(), params)
		if err != nil {
			WriteServerError(w, fmt.Errorf("create kebaktian: %w", err))
			return
		}
		RedirectWithFlash(w, r, fmt.Sprintf("/kebaktian/%d", row.ID), "Kebaktian berhasil ditambahkan", "success")
	}
}

func kebaktianUpdate(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		uid := UserID(r)
		user, err := LoadUser(r.Context(), q, r)
		if err != nil {
			WriteServerError(w, err)
			return
		}
		id, err := ParseChiID(r)
		if err != nil {
			WriteNotFound(w)
			return
		}
		form, params, errs := parseKebaktianForm(r, user.Timezone)
		if len(errs) > 0 {
			w.WriteHeader(http.StatusUnprocessableEntity)
			renderKebaktianForm(w, r, q, rdr, id, form, errs, true)
			return
		}
		_, err = q.UpdateKebaktian(r.Context(), sqlc.UpdateKebaktianParams{
			Nama: params.Nama, WaktuMulai: params.WaktuMulai,
			Lokasi: params.Lokasi, Tema: params.Tema,
			Pengkhotbah: params.Pengkhotbah, Catatan: params.Catatan,
			ID: id, UserID: uid,
		})
		if errors.Is(err, sql.ErrNoRows) {
			WriteNotFound(w)
			return
		}
		if err != nil {
			WriteServerError(w, fmt.Errorf("update kebaktian: %w", err))
			return
		}
		RedirectWithFlash(w, r, fmt.Sprintf("/kebaktian/%d", id), "Kebaktian berhasil diperbarui", "success")
	}
}

func kebaktianDelete(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := ParseChiID(r)
		if err != nil {
			WriteNotFound(w)
			return
		}
		err = q.DeleteKebaktian(r.Context(), sqlc.DeleteKebaktianParams{ID: id, UserID: uid})
		if err != nil {
			WriteServerError(w, fmt.Errorf("delete kebaktian: %w", err))
			return
		}
		if IsHTMX(r) {
			w.WriteHeader(http.StatusOK)
			return
		}
		RedirectWithFlash(w, r, "/kebaktian", "Kebaktian berhasil dihapus", "success")
	}
}

func kebaktianDetail(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
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
		k, err := q.GetKebaktian(r.Context(), sqlc.GetKebaktianParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			WriteNotFound(w)
			return
		}
		if err != nil {
			WriteServerError(w, err)
			return
		}
		jadwal, err := q.ListJadwalByKebaktian(r.Context(), sqlc.ListJadwalByKebaktianParams{
			KebaktianID: id, UserID: uid,
		})
		if err != nil {
			WriteServerError(w, err)
			return
		}
		if err := rdr.Page(w, r, "kebaktian/detail.html", kebaktianDetailPage{
			Title: k.Nama, User: user, Flash: flash, TZ: user.Timezone, Kebaktian: k, Jadwal: jadwal,
		}); err != nil {
			WriteServerError(w, err)
		}
	}
}

func renderKebaktianForm(w http.ResponseWriter, r *http.Request, q *sqlc.Queries, rdr *Renderer, id int64, form kebaktianForm, errs map[string]string, isEdit bool) {
	user, err := LoadUser(r.Context(), q, r)
	if err != nil {
		WriteServerError(w, err)
		return
	}
	flash, _ := PopFlash(w, r)
	title := "Tambah Kebaktian"
	if isEdit {
		title = "Edit Kebaktian"
	}
	if err := rdr.Page(w, r, "kebaktian/form.html", kebaktianFormPage{
		Title: title, User: user, Flash: flash, TZ: user.Timezone, Errors: errs, Form: form,
		KebaktianID: id, IsEdit: isEdit,
	}); err != nil {
		WriteServerError(w, err)
	}
}

func parseKebaktianForm(r *http.Request, tz string) (kebaktianForm, sqlc.CreateKebaktianParams, map[string]string) {
	errs := map[string]string{}
	form := kebaktianForm{
		Nama:        FormString(r, "nama"),
		WaktuMulai:  FormString(r, "waktu_mulai"),
		Lokasi:      FormString(r, "lokasi"),
		Tema:        FormString(r, "tema"),
		Pengkhotbah: FormString(r, "pengkhotbah"),
		Catatan:     FormString(r, "catatan"),
	}
	Required(form.Nama, "Nama", errs)
	MaxLen(form.Nama, 200, "Nama", errs)
	Required(form.WaktuMulai, "WaktuMulai", errs)
	waktuUTC, err := FormTime(r, "waktu_mulai", tz)
	if form.WaktuMulai != "" && err != nil {
		errs["WaktuMulai"] = "Format waktu tidak valid"
	}
	MaxLen(form.Lokasi, 200, "Lokasi", errs)
	MaxLen(form.Tema, 300, "Tema", errs)
	MaxLen(form.Pengkhotbah, 200, "Pengkhotbah", errs)
	MaxLen(form.Catatan, 2000, "Catatan", errs)
	if len(errs) > 0 {
		return form, sqlc.CreateKebaktianParams{}, errs
	}
	return form, sqlc.CreateKebaktianParams{
		Nama: form.Nama, WaktuMulai: waktuUTC,
		Lokasi: NullStringFromForm(form.Lokasi), Tema: NullStringFromForm(form.Tema),
		Pengkhotbah: NullStringFromForm(form.Pengkhotbah), Catatan: NullStringFromForm(form.Catatan),
	}, errs
}
