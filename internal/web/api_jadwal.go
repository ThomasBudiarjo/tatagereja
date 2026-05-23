package web

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/tatagereja/tatagereja/internal/db/sqlc"
)

type jadwalSlotDTO struct {
	ServiceTypeID int64   `json:"service_type_id"`
	PelayanID     *int64  `json:"pelayan_id"`
	Catatan       *string `json:"catatan"`
}

type jadwalSlotReq struct {
	ServiceTypeID int64  `json:"service_type_id"`
	PelayanID     *int64 `json:"pelayan_id"`
	Catatan       string `json:"catatan"`
}

type jadwalReplaceReq struct {
	Slots []jadwalSlotReq `json:"slots"`
}

func mountAPIJadwal(r chi.Router, q *sqlc.Queries, db *sql.DB) {
	r.Route("/kebaktian/{id}/jadwal", func(r chi.Router) {
		r.Get("/", apiJadwalGet(q))
		r.Post("/", apiJadwalReplace(q, db))
	})
}

func apiJadwalGet(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		user, err := LoadUser(r.Context(), q, r)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		kebaktianID, err := ParseChiID(r)
		if err != nil {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		k, err := q.GetKebaktian(r.Context(), sqlc.GetKebaktianParams{ID: kebaktianID, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		serviceTypes, err := q.ListServiceTypes(r.Context(), uid)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		jadwal, err := q.ListJadwalByKebaktian(r.Context(), sqlc.ListJadwalByKebaktianParams{
			KebaktianID: kebaktianID, UserID: uid,
		})
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		jadwalByST := map[int64]sqlc.ListJadwalByKebaktianRow{}
		for _, j := range jadwal {
			jadwalByST[j.ServiceTypeID] = j
		}

		stDTOs := make([]serviceTypeDTO, 0, len(serviceTypes))
		slots := make([]jadwalSlotDTO, 0, len(serviceTypes))
		options := map[string][]sqlc.ListPelayanForServiceTypeRow{}
		for _, s := range serviceTypes {
			stDTOs = append(stDTOs, toServiceTypeDTO(s))
			slot := jadwalSlotDTO{ServiceTypeID: s.ID}
			if j, ok := jadwalByST[s.ID]; ok {
				slot.PelayanID = nullInt64Ptr(j.PelayanID)
				slot.Catatan = nullStrPtr(j.Catatan)
			}
			slots = append(slots, slot)
			opts, err := q.ListPelayanForServiceType(r.Context(), sqlc.ListPelayanForServiceTypeParams{
				UserID: uid, ServiceTypeID: s.ID,
			})
			if err != nil {
				writeJSONError(w, http.StatusInternalServerError, "server error")
				return
			}
			options[strconv.FormatInt(s.ID, 10)] = opts
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"kebaktian":       toKebaktianDTO(k, user.Timezone),
			"service_types":   stDTOs,
			"slots":           slots,
			"pelayan_options": options,
		})
	}
}

func apiJadwalReplace(q *sqlc.Queries, db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		kebaktianID, err := ParseChiID(r)
		if err != nil {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		if _, err := q.GetKebaktian(r.Context(), sqlc.GetKebaktianParams{ID: kebaktianID, UserID: uid}); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeJSONError(w, http.StatusNotFound, "not found")
				return
			}
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}

		var req jadwalReplaceReq
		if err := decodeJSON(r, &req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request")
			return
		}

		errs := map[string]string{}
		var slots []jadwalSlotInput
		for _, s := range req.Slots {
			field := fmt.Sprintf("pelayan_%d", s.ServiceTypeID)
			MaxLen(s.Catatan, 500, fmt.Sprintf("catatan_%d", s.ServiceTypeID), errs)

			if _, err := q.GetServiceType(r.Context(), sqlc.GetServiceTypeParams{ID: s.ServiceTypeID, UserID: uid}); err != nil {
				errs[field] = "Jenis pelayanan tidak valid"
				continue
			}
			var pelayanID sql.NullInt64
			if s.PelayanID != nil {
				if _, err := q.GetPelayan(r.Context(), sqlc.GetPelayanParams{ID: *s.PelayanID, UserID: uid}); err != nil {
					errs[field] = "Pelayan tidak ditemukan"
					continue
				}
				pelayanID = sql.NullInt64{Int64: *s.PelayanID, Valid: true}
			}
			// Skip fully-empty slots to avoid storing blank rows.
			if !pelayanID.Valid && s.Catatan == "" {
				continue
			}
			slots = append(slots, jadwalSlotInput{
				serviceTypeID: s.ServiceTypeID,
				pelayanID:     pelayanID,
				catatan:       NullStringFromForm(s.Catatan),
			})
		}
		if len(errs) > 0 {
			writeValidationErrors(w, errs)
			return
		}
		if err := replaceJadwalSlots(r.Context(), db, q, uid, kebaktianID, slots); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		writeJSON(w, http.StatusNoContent, nil)
	}
}

type jadwalSlotInput struct {
	serviceTypeID int64
	pelayanID     sql.NullInt64
	catatan       sql.NullString
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
		if _, err := tq.CreateJadwal(ctx, sqlc.CreateJadwalParams{
			UserID: uid, KebaktianID: kebaktianID, ServiceTypeID: s.serviceTypeID,
			PelayanID: s.pelayanID, Catatan: s.catatan, Confirmed: 0,
		}); err != nil {
			return fmt.Errorf("create jadwal: %w", err)
		}
	}
	return tx.Commit()
}
