package web

import (
	"net/http"
	"sort"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/tatagereja/tatagereja/internal/db/sqlc"
)

type dashboardService struct {
	ID         int64
	Nama       string
	Tema       string
	WaktuMulai string
	Filled     int64
	Total      int64
	Pct        int64
}

type dashboardDistRow struct {
	Nama  string
	Count int64
	Pct   int64
}

type dashboardPage struct {
	Title             string
	User              sqlc.User
	Flash             Flash
	TZ                string
	HeroTema          string
	WeekLabel         string
	Services          []dashboardService
	JemaatCount       int64
	PelayanAktifCount int64
	WeekAssignments   int64
	ServiceTypeCount  int64
	Distribution      []dashboardDistRow
}

func mountDashboard(r chi.Router, q *sqlc.Queries, rdr *Renderer) {
	r.Get("/", dashboardHandler(q, rdr))
}

func dashboardHandler(q *sqlc.Queries, rdr *Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		uid := UserID(r)
		user, err := LoadUser(ctx, q, r)
		if err != nil {
			WriteServerError(w, err)
			return
		}
		flash, _ := PopFlash(w, r)

		tz := user.Timezone
		if tz == "" {
			tz = "Asia/Jakarta"
		}
		startUTC, endUTC := WeekRangeUTC(time.Now(), tz)

		services, err := q.ListKebaktianRange(ctx, sqlc.ListKebaktianRangeParams{
			UserID: uid, WaktuMulai: startUTC, WaktuMulai_2: endUTC,
		})
		if err != nil {
			WriteServerError(w, err)
			return
		}

		serviceTypes, err := q.ListServiceTypes(ctx, uid)
		if err != nil {
			WriteServerError(w, err)
			return
		}
		totalSlots := int64(len(serviceTypes))

		var heroServices []dashboardService
		var weekAssignments int64
		distCount := map[int64]int64{}
		distName := map[int64]string{}
		for _, st := range serviceTypes {
			distCount[st.ID] = 0
			distName[st.ID] = st.Nama
		}

		heroTema := ""
		for _, k := range services {
			rows, err := q.ListJadwalByKebaktian(ctx, sqlc.ListJadwalByKebaktianParams{
				KebaktianID: k.ID, UserID: uid,
			})
			if err != nil {
				WriteServerError(w, err)
				return
			}
			var filled int64
			for _, row := range rows {
				if row.PelayanID.Valid {
					filled++
					weekAssignments++
					distCount[row.ServiceTypeID]++
				}
			}
			tema := ""
			if k.Tema.Valid {
				tema = k.Tema.String
			}
			if heroTema == "" && tema != "" {
				heroTema = tema
			}
			heroServices = append(heroServices, dashboardService{
				ID:         k.ID,
				Nama:       k.Nama,
				Tema:       tema,
				WaktuMulai: k.WaktuMulai,
				Filled:     filled,
				Total:      totalSlots,
				Pct:        pct(filled, totalSlots),
			})
		}
		if heroTema == "" {
			heroTema = "Berjalan Dalam Iman"
		}

		jemaatCount, err := q.CountJemaat(ctx, uid)
		if err != nil {
			WriteServerError(w, err)
			return
		}

		pelayanRows, err := q.ListPelayan(ctx, uid)
		if err != nil {
			WriteServerError(w, err)
			return
		}
		pelayanCount := int64(len(pelayanRows))

		// Distribution: scale bars to the max value in the set.
		var maxCount int64
		for _, c := range distCount {
			if c > maxCount {
				maxCount = c
			}
		}
		dist := make([]dashboardDistRow, 0, len(serviceTypes))
		for _, st := range serviceTypes {
			c := distCount[st.ID]
			dist = append(dist, dashboardDistRow{
				Nama:  st.Nama,
				Count: c,
				Pct:   pct(c, maxCount),
			})
		}
		sort.Slice(dist, func(i, j int) bool {
			if dist[i].Count != dist[j].Count {
				return dist[i].Count > dist[j].Count
			}
			return dist[i].Nama < dist[j].Nama
		})

		// Week label: range like "20 - 26 MEI" or full single date if span trivial.
		weekLabel := buildWeekLabel(time.Now(), tz)

		page := dashboardPage{
			Title:             "Beranda",
			User:              user,
			Flash:             flash,
			TZ:                tz,
			HeroTema:          heroTema,
			WeekLabel:         weekLabel,
			Services:          heroServices,
			JemaatCount:       jemaatCount,
			PelayanAktifCount: pelayanCount,
			WeekAssignments:   weekAssignments,
			ServiceTypeCount:  int64(len(serviceTypes)),
			Distribution:      dist,
		}

		if err := rdr.Page(w, r, "dashboard.html", page); err != nil {
			WriteServerError(w, err)
		}
	}
}

func buildWeekLabel(now time.Time, tz string) string {
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	local := now.In(loc)
	wd := int(local.Weekday())
	mondayOffset := (wd + 6) % 7
	monday := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc).AddDate(0, 0, -mondayOffset)
	// Sunday of this week is the upcoming celebration day.
	sunday := monday.AddDate(0, 0, 6)
	return indonesianWeekdays[sunday.Weekday()] + " · " +
		formatIndonesian(sunday, "dayMonth")
}
