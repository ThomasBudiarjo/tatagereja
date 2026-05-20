package web

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/tatagereja/tatagereja/backend/internal/db/sqlc"
)

type jadwalSlotForm struct {
	ServiceTypeID int64
	PelayanID     string
	Catatan       string
}

type jadwalEditorPage struct {
	Title         string
	User          sqlc.User
	Flash         Flash
	Errors        map[string]string
	Kebaktian     sqlc.Kebaktian
	ServiceTypes  []sqlc.ServiceType
	Slots         []jadwalSlotForm
	PelayanByType map[int64][]sqlc.ListPelayanForServiceTypeRow
	Jadwal        []sqlc.ListJadwalByKebaktianRow
}

func mountJadwal(r chi.Router, q *sqlc.Queries, db *sql.DB, rdr *Renderer) {
	r.Route("/kebaktian/{id}/jadwal", func(r chi.Router) {
		r.Get("/", jadwalEditor(q, rdr))
		r.Post("/", jadwalReplace(q, db, rdr))
	})
}

func jadwalEditor(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		user, err := LoadUser(r.Context(), q, r)
		if err != nil {
			WriteServerError(w, err)
			return
		}
		flash, _ := PopFlash(w, r)
		kebaktianID, err := ParseChiID(r)
		if err != nil {
			WriteNotFound(w)
			return
		}
		k, err := q.GetKebaktian(r.Context(), sqlc.GetKebaktianParams{ID: kebaktianID, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			WriteNotFound(w)
			return
		}
		if err != nil {
			WriteServerError(w, err)
			return
		}
		st, err := q.ListServiceTypes(r.Context(), uid)
		if err != nil {
			WriteServerError(w, err)
			return
		}
		jadwal, err := q.ListJadwalByKebaktian(r.Context(), sqlc.ListJadwalByKebaktianParams{
			KebaktianID: kebaktianID, UserID: uid,
		})
		if err != nil {
			WriteServerError(w, err)
			return
		}
		jadwalByST := map[int64]sqlc.ListJadwalByKebaktianRow{}
		for _, j := range jadwal {
			jadwalByST[j.ServiceTypeID] = j
		}
		slots := make([]jadwalSlotForm, 0, len(st))
		pelayanByType := map[int64][]sqlc.ListPelayanForServiceTypeRow{}
		for _, s := range st {
			slot := jadwalSlotForm{ServiceTypeID: s.ID}
			if j, ok := jadwalByST[s.ID]; ok {
				slot.PelayanID = nullInt64(j.PelayanID)
				slot.Catatan = derefString(j.Catatan)
			}
			slots = append(slots, slot)
			opts, err := q.ListPelayanForServiceType(r.Context(), sqlc.ListPelayanForServiceTypeParams{
				UserID: uid, ServiceTypeID: s.ID,
			})
			if err != nil {
				WriteServerError(w, err)
				return
			}
			pelayanByType[s.ID] = opts
		}
		if err := rdr.Page(w, r, "kebaktian/jadwal.html", jadwalEditorPage{
			Title: "Jadwal Pelayanan", User: user, Flash: flash, Kebaktian: k,
			ServiceTypes: st, Slots: slots, PelayanByType: pelayanByType, Jadwal: jadwal,
		}); err != nil {
			WriteServerError(w, err)
		}
	}
}

func jadwalReplace(q *sqlc.Queries, db *sql.DB, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		uid := UserID(r)
		kebaktianID, err := ParseChiID(r)
		if err != nil {
			WriteNotFound(w)
			return
		}
		_, err = q.GetKebaktian(r.Context(), sqlc.GetKebaktianParams{ID: kebaktianID, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			WriteNotFound(w)
			return
		}
		if err != nil {
			WriteServerError(w, err)
			return
		}
		serviceTypes, err := q.ListServiceTypes(r.Context(), uid)
		if err != nil {
			WriteServerError(w, err)
			return
		}
		errs := map[string]string{}
		var slots []jadwalSlotInput
		for _, st := range serviceTypes {
			key := fmt.Sprintf("pelayan_%d", st.ID)
			pelayanVal := strings.TrimSpace(r.FormValue(key))
			catatanKey := fmt.Sprintf("catatan_%d", st.ID)
			catatanVal := strings.TrimSpace(r.FormValue(catatanKey))
			MaxLen(catatanVal, 500, fmt.Sprintf("Catatan_%d", st.ID), errs)

			var pelayanID sql.NullInt64
			if pelayanVal != "" {
				pid, perr := strconv.ParseInt(pelayanVal, 10, 64)
				if perr != nil {
					errs[key] = "Pelayan tidak valid"
					continue
				}
				_, perr = q.GetPelayan(r.Context(), sqlc.GetPelayanParams{ID: pid, UserID: uid})
				if errors.Is(perr, sql.ErrNoRows) {
					errs[key] = "Pelayan tidak ditemukan"
					continue
				}
				if perr != nil {
					errs[key] = "Pelayan tidak valid"
					continue
				}
				pelayanID = sql.NullInt64{Int64: pid, Valid: true}
			}
			_, err := q.GetServiceType(r.Context(), sqlc.GetServiceTypeParams{ID: st.ID, UserID: uid})
			if errors.Is(err, sql.ErrNoRows) {
				errs[key] = "Jenis pelayanan tidak valid"
				continue
			}
			slots = append(slots, jadwalSlotInput{
				serviceTypeID: st.ID,
				pelayanID:     pelayanID,
				catatan:       NullStringFromForm(catatanVal),
			})
		}
		if len(errs) > 0 {
			w.WriteHeader(http.StatusUnprocessableEntity)
			renderJadwalEditorWithErrors(w, r, q, rdr, uid, kebaktianID, errs)
			return
		}
		if err := replaceJadwalSlots(r.Context(), db, q, uid, kebaktianID, slots); err != nil {
			WriteServerError(w, err)
			return
		}
		RedirectWithFlash(w, r, fmt.Sprintf("/kebaktian/%d/jadwal", kebaktianID), "Jadwal berhasil disimpan", "success")
	}
}

type jadwalSlotInput struct {
	serviceTypeID int64
	pelayanID     sql.NullInt64
	catatan       sql.NullString
}

func renderJadwalEditorWithErrors(w http.ResponseWriter, r *http.Request, q *sqlc.Queries, rdr *Renderer, uid, kebaktianID int64, errs map[string]string) {
	user, err := LoadUser(r.Context(), q, r)
	if err != nil {
		WriteServerError(w, err)
		return
	}
	k, err := q.GetKebaktian(r.Context(), sqlc.GetKebaktianParams{ID: kebaktianID, UserID: uid})
	if err != nil {
		WriteServerError(w, err)
		return
	}
	st, err := q.ListServiceTypes(r.Context(), uid)
	if err != nil {
		WriteServerError(w, err)
		return
	}
	slots := make([]jadwalSlotForm, 0, len(st))
	pelayanByType := map[int64][]sqlc.ListPelayanForServiceTypeRow{}
	for _, s := range st {
		key := fmt.Sprintf("pelayan_%d", s.ID)
		catatanKey := fmt.Sprintf("catatan_%d", s.ID)
		slots = append(slots, jadwalSlotForm{
			ServiceTypeID: s.ID,
			PelayanID:     r.FormValue(key),
			Catatan:       r.FormValue(catatanKey),
		})
		opts, oerr := q.ListPelayanForServiceType(r.Context(), sqlc.ListPelayanForServiceTypeParams{
			UserID: uid, ServiceTypeID: s.ID,
		})
		if oerr != nil {
			WriteServerError(w, oerr)
			return
		}
		pelayanByType[s.ID] = opts
	}
	_ = rdr.Page(w, r, "kebaktian/jadwal.html", jadwalEditorPage{
		Title: "Jadwal Pelayanan", User: user, Errors: errs, Kebaktian: k,
		ServiceTypes: st, Slots: slots, PelayanByType: pelayanByType,
	})
}

func replaceJadwalSlots(ctx context.Context, db *sql.DB, q *sqlc.Queries, uid, kebaktianID int64, slots []jadwalSlotInput) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	tq := q.WithTx(tx)
	if err := tq.DeleteJadwalByKebaktian(ctx, sqlc.DeleteJadwalByKebaktianParams{
		KebaktianID: kebaktianID, UserID: uid,
	}); err != nil {
		return fmt.Errorf("delete jadwal: %w", err)
	}
	for _, s := range slots {
		_, err := tq.CreateJadwal(ctx, sqlc.CreateJadwalParams{
			UserID: uid, KebaktianID: kebaktianID, ServiceTypeID: s.serviceTypeID,
			PelayanID: s.pelayanID, Catatan: s.catatan, Confirmed: 0,
		})
		if err != nil {
			return fmt.Errorf("create jadwal: %w", err)
		}
	}
	return tx.Commit()
}
