package web

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/tatagereja/tatagereja/internal/db/sqlc"
)

type pelayanDTO struct {
	ID             int64    `json:"id"`
	JemaatID       int64    `json:"jemaat_id"`
	JemaatNama     string   `json:"jemaat_nama"`
	Catatan        *string  `json:"catatan"`
	ServiceTypeIDs []int64  `json:"service_type_ids"`
	ServiceTypes   []string `json:"service_types"`
}

type pelayanReq struct {
	JemaatID       int64   `json:"jemaat_id"`
	Catatan        string  `json:"catatan"`
	ServiceTypeIDs []int64 `json:"service_type_ids"`
}

func mountAPIPelayan(r chi.Router, q *sqlc.Queries, db *sql.DB) {
	r.Route("/pelayan", func(r chi.Router) {
		r.Get("/", apiPelayanList(q))
		r.Post("/", apiPelayanCreate(q, db))
		r.Get("/{id}", apiPelayanGet(q))
		r.Put("/{id}", apiPelayanUpdate(q, db))
		r.Delete("/{id}", apiPelayanDelete(q))
	})
}

func apiPelayanList(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := q.ListPelayan(r.Context(), UserID(r))
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		dtos := make([]pelayanDTO, 0, len(rows))
		for _, row := range rows {
			names, err := q.ListPelayanServiceTypeNames(r.Context(), row.ID)
			if err != nil {
				writeJSONError(w, http.StatusInternalServerError, "server error")
				return
			}
			dtos = append(dtos, pelayanDTO{
				ID: row.ID, JemaatID: row.JemaatID, JemaatNama: row.JemaatNama,
				Catatan: nullStrPtr(row.Catatan), ServiceTypes: names,
			})
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": dtos})
	}
}

func apiPelayanGet(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := ParseChiID(r)
		if err != nil {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		p, err := q.GetPelayan(r.Context(), sqlc.GetPelayanParams{ID: id, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		j, err := q.GetJemaat(r.Context(), sqlc.GetJemaatParams{ID: p.JemaatID, UserID: uid})
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		ids, err := q.ListPelayanServiceTypeIDs(r.Context(), id)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		names, err := q.ListPelayanServiceTypeNames(r.Context(), id)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"pelayan": pelayanDTO{
			ID: p.ID, JemaatID: p.JemaatID, JemaatNama: j.NamaLengkap,
			Catatan: nullStrPtr(p.Catatan), ServiceTypeIDs: ids, ServiceTypes: names,
		}})
	}
}

func apiPelayanCreate(q *sqlc.Queries, db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req pelayanReq
		if err := decodeJSON(r, &req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request")
			return
		}
		uid := UserID(r)
		if errs := validatePelayanReq(r, q, uid, req); len(errs) > 0 {
			writeValidationErrors(w, errs)
			return
		}
		row, err := createPelayanWithTypes(r.Context(), db, q, uid, req.JemaatID, req.Catatan, req.ServiceTypeIDs)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"pelayan": map[string]any{"id": row.ID}})
	}
}

func apiPelayanUpdate(q *sqlc.Queries, db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req pelayanReq
		if err := decodeJSON(r, &req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request")
			return
		}
		uid := UserID(r)
		id, err := ParseChiID(r)
		if err != nil {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		if errs := validatePelayanReq(r, q, uid, req); len(errs) > 0 {
			writeValidationErrors(w, errs)
			return
		}
		if err := updatePelayanWithTypes(r.Context(), db, q, uid, id, req.JemaatID, req.Catatan, req.ServiceTypeIDs); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeJSONError(w, http.StatusNotFound, "not found")
				return
			}
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"pelayan": map[string]any{"id": id}})
	}
}

func apiPelayanDelete(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := UserID(r)
		id, err := ParseChiID(r)
		if err != nil {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		if err := q.DeletePelayan(r.Context(), sqlc.DeletePelayanParams{ID: id, UserID: uid}); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		writeJSON(w, http.StatusNoContent, nil)
	}
}

func validatePelayanReq(r *http.Request, q *sqlc.Queries, uid int64, req pelayanReq) map[string]string {
	errs := map[string]string{}
	MaxLen(req.Catatan, 2000, "Catatan", errs)
	if req.JemaatID == 0 {
		errs["JemaatID"] = "Wajib diisi"
	} else {
		_, err := q.GetJemaat(r.Context(), sqlc.GetJemaatParams{ID: req.JemaatID, UserID: uid})
		if errors.Is(err, sql.ErrNoRows) {
			errs["JemaatID"] = "Jemaat tidak ditemukan"
		} else if err != nil {
			errs["JemaatID"] = "Jemaat tidak valid"
		}
	}
	for _, sid := range req.ServiceTypeIDs {
		_, err := q.GetServiceType(r.Context(), sqlc.GetServiceTypeParams{ID: sid, UserID: uid})
		if err != nil {
			errs["ServiceTypeIDs"] = "Jenis pelayanan tidak valid"
			break
		}
	}
	return errs
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
