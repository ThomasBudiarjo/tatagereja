// Package report builds the dashboard summary and CSV exports (Laporan).
package report

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"net/http"
	"time"

	"github.com/thomasbudiarjo/tatagereja/internal/auth"
	"github.com/thomasbudiarjo/tatagereja/internal/httpx"
)

type Handler struct{ DB *sql.DB }

// timestamps are stored as "YYYY-MM-DDTHH:MM" (datetime-local), so string
// comparison orders chronologically.
const tsLayout = "2006-01-02T15:04"

type upcomingService struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	ServiceType string `json:"service_type"`
	StartTime   string `json:"start_time"`
	Location    string `json:"location"`
}

type weekRole struct {
	ServiceID    string `json:"service_id"`
	ServiceTitle string `json:"service_title"`
	StartTime    string `json:"start_time"`
	RoleName     string `json:"role_name"`
	FullName     string `json:"full_name"`
}

type birthday struct {
	ID        string `json:"id"`
	FullName  string `json:"full_name"`
	BirthDate string `json:"birth_date"`
}

type recentAttendance struct {
	ServiceID string `json:"service_id"`
	Title     string `json:"title"`
	StartTime string `json:"start_time"`
	Count     int    `json:"count"`
}

func (h *Handler) Dashboard(w http.ResponseWriter, r *http.Request) {
	churchID := auth.ChurchID(r)
	now := time.Now()
	nowStr := now.Format(tsLayout)
	weekEnd := now.AddDate(0, 0, 7).Format(tsLayout)
	month := now.Format("01")

	out := map[string]any{}

	var totalMembers, totalActive, totalFamilies int
	h.DB.QueryRow(`SELECT COUNT(*) FROM members WHERE church_id = ?`, churchID).Scan(&totalMembers)
	h.DB.QueryRow(`SELECT COUNT(*) FROM members WHERE church_id = ? AND status = 'active'`, churchID).Scan(&totalActive)
	h.DB.QueryRow(`SELECT COUNT(*) FROM families WHERE church_id = ?`, churchID).Scan(&totalFamilies)
	out["total_members"] = totalMembers
	out["total_active_members"] = totalActive
	out["total_families"] = totalFamilies

	upcoming := []upcomingService{}
	rows, err := h.DB.Query(`
		SELECT id, title, service_type, start_time, COALESCE(location,'')
		FROM services WHERE church_id = ? AND start_time >= ?
		ORDER BY start_time LIMIT 5`, churchID, nowStr)
	if err == nil {
		for rows.Next() {
			var s upcomingService
			if rows.Scan(&s.ID, &s.Title, &s.ServiceType, &s.StartTime, &s.Location) == nil {
				upcoming = append(upcoming, s)
			}
		}
		rows.Close()
	}
	out["upcoming_services"] = upcoming

	weekRoles := []weekRole{}
	rows, err = h.DB.Query(`
		SELECT s.id, s.title, s.start_time, sr.role_name, m.full_name
		FROM service_roles sr
		JOIN services s ON s.id = sr.service_id
		JOIN members m ON m.id = sr.member_id
		WHERE s.church_id = ? AND s.start_time >= ? AND s.start_time <= ?
		ORDER BY s.start_time, sr.role_name`, churchID, nowStr, weekEnd)
	if err == nil {
		for rows.Next() {
			var wr weekRole
			if rows.Scan(&wr.ServiceID, &wr.ServiceTitle, &wr.StartTime, &wr.RoleName, &wr.FullName) == nil {
				weekRoles = append(weekRoles, wr)
			}
		}
		rows.Close()
	}
	out["this_week_roles"] = weekRoles

	birthdays := []birthday{}
	rows, err = h.DB.Query(`
		SELECT id, full_name, birth_date FROM members
		WHERE church_id = ? AND birth_date IS NOT NULL AND birth_date != ''
		AND strftime('%m', birth_date) = ?
		ORDER BY strftime('%d', birth_date)`, churchID, month)
	if err == nil {
		for rows.Next() {
			var b birthday
			if rows.Scan(&b.ID, &b.FullName, &b.BirthDate) == nil {
				birthdays = append(birthdays, b)
			}
		}
		rows.Close()
	}
	out["birthdays_this_month"] = birthdays

	recent := []recentAttendance{}
	rows, err = h.DB.Query(`
		SELECT s.id, s.title, s.start_time, COUNT(a.id)
		FROM services s JOIN attendance a ON a.service_id = s.id
		WHERE s.church_id = ?
		GROUP BY s.id ORDER BY s.start_time DESC LIMIT 5`, churchID)
	if err == nil {
		for rows.Next() {
			var ra recentAttendance
			if rows.Scan(&ra.ServiceID, &ra.Title, &ra.StartTime, &ra.Count) == nil {
				recent = append(recent, ra)
			}
		}
		rows.Close()
	}
	out["recent_attendance"] = recent

	httpx.JSON(w, http.StatusOK, out)
}

// MembersCSV exports all members of the church as CSV.
func (h *Handler) MembersCSV(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(`
		SELECT full_name, COALESCE(phone,''), COALESCE(email,''), COALESCE(address,''),
		       COALESCE(birth_date,''), COALESCE(gender,''), status, COALESCE(notes,'')
		FROM members WHERE church_id = ? ORDER BY full_name COLLATE NOCASE`, auth.ChurchID(r))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="members.csv"`)
	cw := csv.NewWriter(w)
	cw.Write([]string{"full_name", "phone", "email", "address", "birth_date", "gender", "status", "notes"})
	for rows.Next() {
		rec := make([]string, 8)
		ptrs := make([]any, 8)
		for i := range rec {
			ptrs[i] = &rec[i]
		}
		if rows.Scan(ptrs...) == nil {
			cw.Write(rec)
		}
	}
	cw.Flush()
}

// AttendanceCSV exports attendance per service as CSV.
func (h *Handler) AttendanceCSV(w http.ResponseWriter, r *http.Request) {
	churchID := auth.ChurchID(r)
	rows, err := h.DB.Query(`
		SELECT s.title, s.start_time, COALESCE(m.full_name, COALESCE(a.guest_name,'')), a.is_guest
		FROM attendance a
		JOIN services s ON s.id = a.service_id
		LEFT JOIN members m ON m.id = a.member_id
		WHERE s.church_id = ?
		ORDER BY s.start_time DESC, a.is_guest`, churchID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="attendance.csv"`)
	cw := csv.NewWriter(w)
	cw.Write([]string{"service", "start_time", "name", "is_guest"})
	for rows.Next() {
		var title, start, name string
		var isGuest bool
		if rows.Scan(&title, &start, &name, &isGuest) == nil {
			cw.Write([]string{title, start, name, fmt.Sprintf("%t", isGuest)})
		}
	}
	cw.Flush()
}
