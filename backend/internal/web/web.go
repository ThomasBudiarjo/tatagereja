package web

import (
	"embed"
	"fmt"
	"html/template"
	"log/slog"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"
)

//go:embed templates
var templateFS embed.FS

type PageData struct {
	User    any
	Flash   *Flash
	Data    any
}

type Flash struct {
	Message string
	Kind    string // "success" | "error" | "info"
}

type Renderer struct {
	tmpl *template.Template
}

func NewRenderer() *Renderer {
	funcMap := template.FuncMap{
		"formatDateTime": formatDateTime,
		"toLocalInput":   toLocalInput,
		"add":            func(a, b int64) int64 { return a + b },
		"sub":            func(a, b int64) int64 { return a - b },
		"nl2br":          func(s string) template.HTML { return template.HTML(strings.ReplaceAll(template.HTMLEscapeString(s), "\n", "<br>")) },
	}
	tmpl := template.Must(template.New("").Funcs(funcMap).ParseFS(templateFS, "templates/*.html", "templates/**/*.html"))
	return &Renderer{tmpl: tmpl}
}

func (rnd *Renderer) Page(w http.ResponseWriter, r *http.Request, name string, data any) {
	pd := PageData{
		User:  userFromCtx(r),
		Flash: popFlash(w, r),
		Data:  data,
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := rnd.tmpl.ExecuteTemplate(w, "layout", map[string]any{
		"Page": name,
		"Data": pd,
	}); err != nil {
		slog.Error("render page", "template", name, "err", err)
	}
}

func (rnd *Renderer) Fragment(w http.ResponseWriter, r *http.Request, name string, data any) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := rnd.tmpl.ExecuteTemplate(w, name, data); err != nil {
		slog.Error("render fragment", "template", name, "err", err)
	}
}

const flashCookie = "tatagereja_flash"

func SetFlash(w http.ResponseWriter, message, kind string) {
	http.SetCookie(w, &http.Cookie{
		Name:     flashCookie,
		Value:    kind + ":" + message,
		Path:     "/",
		HttpOnly: true,
		MaxAge:   30,
	})
}

func popFlash(w http.ResponseWriter, r *http.Request) *Flash {
	c, err := r.Cookie(flashCookie)
	if err != nil {
		return nil
	}
	http.SetCookie(w, &http.Cookie{Name: flashCookie, Value: "", Path: "/", MaxAge: -1})
	parts := strings.SplitN(c.Value, ":", 2)
	if len(parts) != 2 {
		return nil
	}
	return &Flash{Kind: parts[0], Message: parts[1]}
}

func ParsePagination(r *http.Request) (limit, offset int64) {
	limit = 25
	offset = 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n >= 0 {
			offset = n
		}
	}
	return limit, offset
}

func EscapeLike(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "%", "\\%")
	s = strings.ReplaceAll(s, "_", "\\_")
	return "%" + s + "%"
}

func IsHTMX(r *http.Request) bool {
	return r.Header.Get("HX-Request") == "true"
}

func HXRedirect(w http.ResponseWriter, url string) {
	w.Header().Set("HX-Redirect", url)
	w.WriteHeader(http.StatusOK)
}

func FormString(r *http.Request, key string) string {
	return strings.TrimSpace(r.FormValue(key))
}


func FormInt64(r *http.Request, key string) (int64, bool) {
	v := strings.TrimSpace(r.FormValue(key))
	if v == "" {
		return 0, false
	}
	n, err := strconv.ParseInt(v, 10, 64)
	return n, err == nil
}

func formatDateTime(utcISO, tz, layout string) string {
	t, err := time.Parse(time.RFC3339, utcISO)
	if err != nil {
		t, err = time.Parse("2006-01-02T15:04:05.000Z", utcISO)
		if err != nil {
			return utcISO
		}
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return t.Format(layout)
	}
	return t.In(loc).Format(layout)
}

func toLocalInput(utcISO, tz string) string {
	t, err := time.Parse(time.RFC3339, utcISO)
	if err != nil {
		t, err = time.Parse("2006-01-02T15:04:05.000Z", utcISO)
		if err != nil {
			return ""
		}
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return t.Format("2006-01-02T15:04")
	}
	return t.In(loc).Format("2006-01-02T15:04")
}

func ParseLocalDateTime(v, tz string) (string, error) {
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	t, err := time.ParseInLocation("2006-01-02T15:04", v, loc)
	if err != nil {
		return "", fmt.Errorf("invalid datetime: %w", err)
	}
	return t.UTC().Format(time.RFC3339), nil
}

// Validation helpers

func Required(v, field string, errs map[string]string) {
	if strings.TrimSpace(v) == "" {
		errs[field] = field + " wajib diisi."
	}
}

func MaxLen(v string, n int, field string, errs map[string]string) {
	if len([]rune(v)) > n {
		errs[field] = fmt.Sprintf("%s maksimal %d karakter.", field, n)
	}
}

func ValidEmail(v, field string, errs map[string]string) {
	if v == "" {
		return
	}
	if _, err := mail.ParseAddress(v); err != nil {
		errs[field] = "Format email tidak valid."
	}
}

func OneOf(v string, allowed []string, field string, errs map[string]string) {
	if v == "" {
		return
	}
	for _, a := range allowed {
		if v == a {
			return
		}
	}
	errs[field] = field + " tidak valid."
}

func ValidDate(v, field string, errs map[string]string) {
	if v == "" {
		return
	}
	t, err := time.Parse("2006-01-02", v)
	if err != nil {
		errs[field] = "Format tanggal tidak valid (YYYY-MM-DD)."
		return
	}
	if t.After(time.Now()) {
		errs[field] = field + " tidak boleh di masa depan."
	}
}
