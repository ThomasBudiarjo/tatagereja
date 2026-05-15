package handlers

import (
	"database/sql"
	"log/slog"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/thomas/tatagereja/backend/internal/db/sqlc"
	appmw "github.com/thomas/tatagereja/backend/internal/middleware"
	"github.com/thomas/tatagereja/backend/internal/models"
)

type DashboardHandler struct {
	q *sqlc.Queries
}

func NewDashboardHandler(db *sql.DB) *DashboardHandler {
	return &DashboardHandler{q: sqlc.New(db)}
}

func (h *DashboardHandler) UpcomingBirthdays(w http.ResponseWriter, r *http.Request) {
	churchID := appmw.GetChurchID(r)
	ctx := r.Context()

	days := int64(30)
	if v := r.URL.Query().Get("days"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 && n <= 366 {
			days = n
		}
	}

	rows, err := h.q.ListActiveJemaatWithBirthday(ctx, churchID)
	if err != nil {
		slog.Error("list jemaat birthdays", "err", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	today := time.Now().UTC()
	todayDate := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC)

	entries := make([]models.BirthdayEntry, 0, len(rows))
	for _, row := range rows {
		if row.TanggalLahir == nil || *row.TanggalLahir == "" {
			continue
		}
		dob, err := time.Parse("2006-01-02", *row.TanggalLahir)
		if err != nil {
			continue
		}

		next := time.Date(todayDate.Year(), dob.Month(), dob.Day(), 0, 0, 0, 0, time.UTC)
		if next.Before(todayDate) {
			next = time.Date(todayDate.Year()+1, dob.Month(), dob.Day(), 0, 0, 0, 0, time.UTC)
		}
		daysUntil := int(next.Sub(todayDate).Hours() / 24)
		if int64(daysUntil) > days {
			continue
		}

		age := next.Year() - dob.Year()

		entries = append(entries, models.BirthdayEntry{
			JemaatID:      row.ID,
			NamaLengkap:   row.NamaLengkap,
			NamaPanggilan: row.NamaPanggilan,
			TanggalLahir:  *row.TanggalLahir,
			NextBirthday:  next.Format("2006-01-02"),
			DaysUntil:     daysUntil,
			AgeTurning:    age,
		})
	}

	sort.Slice(entries, func(i, j int) bool {
		if entries[i].DaysUntil != entries[j].DaysUntil {
			return entries[i].DaysUntil < entries[j].DaysUntil
		}
		return entries[i].NamaLengkap < entries[j].NamaLengkap
	})

	if len(entries) > 50 {
		entries = entries[:50]
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data":  entries,
		"days":  days,
		"total": len(entries),
	})
}
