package web

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/thomasbudiarjo/tatagereja/backend/internal/db/sqlc"
)

func mountJadwal(r chi.Router, q *sqlc.Queries, database *sql.DB, rdr *Renderer) {
	r.Get("/kebaktian/{id}/jadwal", jadwalEditor(q, rdr))
	r.Post("/kebaktian/{id}/jadwal", jadwalSave(q, database, rdr))
}

func jadwalEditor(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		kb, err := q.GetKebaktian(r.Context(), sqlc.GetKebaktianParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		serviceTypes, _ := q.ListServiceTypes(r.Context(), uid)
		pelayans, _ := q.ListPelayan(r.Context(), uid)
		jadwal, _ := q.ListJadwalByKebaktian(r.Context(), sqlc.ListJadwalByKebaktianParams{KebaktianID: id, UserID: uid})

		// Build a map: service_type_id -> jadwal row
		jadwalMap := map[int64]sqlc.JadwalRow{}
		for _, j := range jadwal {
			jadwalMap[j.ServiceTypeID] = j
		}

		user, _ := r.Context().Value(userObjKey).(sqlc.User)
		rdr.Page(w, r, "kebaktian/jadwal", map[string]any{
			"Kebaktian":    kb,
			"ServiceTypes": serviceTypes,
			"Pelayans":     pelayans,
			"JadwalMap":    jadwalMap,
			"Timezone":     user.Timezone,
		})
	}
}

func jadwalSave(q *sqlc.Queries, database *sql.DB, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		kb, err := q.GetKebaktian(r.Context(), sqlc.GetKebaktianParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		if err := r.ParseForm(); err != nil {
			http.Error(w, "Bad Request", http.StatusBadRequest)
			return
		}

		// Collect all service_types for this user
		serviceTypes, err := q.ListServiceTypes(r.Context(), uid)
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}

		type slot struct {
			ServiceTypeID int64
			PelayanID     sql.NullInt64
			Catatan       sql.NullString
		}
		var slots []slot

		for _, st := range serviceTypes {
			fieldName := "pelayan_" + strconv.FormatInt(st.ID, 10)
			pelayanVal := strings.TrimSpace(r.FormValue(fieldName))
			catatanVal := strings.TrimSpace(r.FormValue("catatan_" + strconv.FormatInt(st.ID, 10)))

			// Validate pelayan_id belongs to user if set
			if pelayanVal != "" {
				pID, err := strconv.ParseInt(pelayanVal, 10, 64)
				if err != nil {
					http.Error(w, "Bad Request", http.StatusBadRequest)
					return
				}
				if _, err := q.GetPelayan(r.Context(), sqlc.GetPelayanParams{ID: pID, UserID: uid}); errors.Is(err, sql.ErrNoRows) {
					http.Error(w, "Not Found", http.StatusNotFound)
					return
				}
				slots = append(slots, slot{ServiceTypeID: st.ID, PelayanID: sql.NullInt64{Int64: pID, Valid: true}, Catatan: nullStr(catatanVal)})
			} else {
				slots = append(slots, slot{ServiceTypeID: st.ID, PelayanID: sql.NullInt64{}, Catatan: nullStr(catatanVal)})
			}
		}

		tx, err := database.BeginTx(r.Context(), nil)
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()
		qtx := q.WithTx(tx)

		if err := qtx.DeleteJadwalByKebaktian(r.Context(), sqlc.DeleteJadwalByKebaktianParams{KebaktianID: kb.ID, UserID: uid}); err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		for _, s := range slots {
			if _, err := qtx.CreateJadwalSlot(r.Context(), sqlc.CreateJadwalSlotParams{
				UserID: uid, KebaktianID: kb.ID, ServiceTypeID: s.ServiceTypeID,
				PelayanID: s.PelayanID, Catatan: s.Catatan, Confirmed: 0,
			}); err != nil {
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
				return
			}
		}
		if err := tx.Commit(); err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}

		SetFlash(w, "Jadwal berhasil disimpan.", "success")
		redirectTo := "/kebaktian/" + strconv.FormatInt(kb.ID, 10) + "/jadwal"
		if IsHTMX(r) {
			HXRedirect(w, redirectTo)
			return
		}
		http.Redirect(w, r, redirectTo, http.StatusSeeOther)
	}
}
