package web

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"html"
	"html/template"
	"log/slog"
	"net/http"
	"net/mail"
	"net/url"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/tatagereja/tatagereja/internal/db/sqlc"
	"github.com/tatagereja/tatagereja/internal/templates"
)

const (
	flashCookieName = "tatagereja_flash"
	defaultPageSize = 50
	maxPageSize     = 100
)

type Flash struct {
	Kind    string
	Message string
}

type Renderer struct {
	tmpl *template.Template
}

type layoutData struct {
	Data any
	Body template.HTML
	Path string
}

func NewRenderer() *Renderer {
	funcs := template.FuncMap{
		"formatDateTime": formatDateTime,
		"toLocalInput":   toLocalInput,
		"add":            add,
		"sub":            sub,
		"derefString":    derefString,
		"nullInt64":      nullInt64,
		"hasPrefix":      strings.HasPrefix,
	}
	tmpl := template.New("").Funcs(funcs)
	tmpl, err := tmpl.ParseFS(templates.FS, "*.html", "**/*.html")
	if err != nil {
		slog.Error("parse templates", "err", err)
	}
	return &Renderer{tmpl: tmpl}
}

func (r *Renderer) Page(w http.ResponseWriter, req *http.Request, name string, data any) error {
	var buf bytes.Buffer
	if err := r.tmpl.ExecuteTemplate(&buf, name, data); err != nil {
		return err
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if isHTMXNavigation(req) {
		title := reflectTitle(data)
		var pageTitle string
		if title != "" {
			pageTitle = html.EscapeString(title) + " - Tata Gereja"
		} else {
			pageTitle = "Tata Gereja"
		}
		if _, err := w.Write(buf.Bytes()); err != nil {
			return err
		}
		_, err := fmt.Fprintf(w, `<title hx-swap-oob="true">%s</title>`, pageTitle)
		return err
	}
	return r.tmpl.ExecuteTemplate(w, "layout", layoutData{
		Data: data,
		Body: template.HTML(buf.String()),
		Path: req.URL.Path,
	})
}

// isHTMXNavigation returns true when the request is an HTMX fetch targeting the
// main content area (#content), i.e. a full-page navigation rather than an
// inline partial (delete row, search result, etc.).
func isHTMXNavigation(r *http.Request) bool {
	return r.Header.Get("HX-Request") == "true" && r.Header.Get("HX-Target") == "content"
}

// reflectTitle extracts the Title field from a page data struct via reflection.
func reflectTitle(data any) string {
	if data == nil {
		return ""
	}
	v := reflect.ValueOf(data)
	if v.Kind() == reflect.Ptr {
		v = v.Elem()
	}
	if v.Kind() != reflect.Struct {
		return ""
	}
	f := v.FieldByName("Title")
	if !f.IsValid() || f.Kind() != reflect.String {
		return ""
	}
	return f.String()
}

func (r *Renderer) Fragment(w http.ResponseWriter, req *http.Request, name string, data any) error {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	return r.tmpl.ExecuteTemplate(w, name, data)
}

func SetFlash(w http.ResponseWriter, msg, kind string) {
	val := url.QueryEscape(kind + "|" + msg)
	http.SetCookie(w, &http.Cookie{
		Name:     flashCookieName,
		Value:    val,
		Path:     "/",
		MaxAge:   120,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func PopFlash(w http.ResponseWriter, r *http.Request) (Flash, bool) {
	c, err := r.Cookie(flashCookieName)
	if err != nil || c.Value == "" {
		return Flash{}, false
	}
	http.SetCookie(w, &http.Cookie{
		Name:     flashCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	decoded, err := url.QueryUnescape(c.Value)
	if err != nil {
		return Flash{}, false
	}
	parts := strings.SplitN(decoded, "|", 2)
	if len(parts) != 2 {
		return Flash{}, false
	}
	return Flash{Kind: parts[0], Message: parts[1]}, true
}

func ParsePagination(r *http.Request) (limit, offset int64) {
	limit = defaultPageSize
	offset = 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			limit = n
		}
	}
	if limit > maxPageSize {
		limit = maxPageSize
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n >= 0 {
			offset = n
		}
	}
	return limit, offset
}

func EscapeLike(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `%`, `\%`)
	s = strings.ReplaceAll(s, `_`, `\_`)
	return "%" + s + "%"
}

func IsHTMX(r *http.Request) bool {
	return r.Header.Get("HX-Request") == "true"
}

func HXRedirect(w http.ResponseWriter, url string) {
	w.Header().Set("HX-Redirect", url)
	w.WriteHeader(http.StatusOK)
}

func Redirect(w http.ResponseWriter, r *http.Request, url string) {
	if IsHTMX(r) {
		HXRedirect(w, url)
		return
	}
	http.Redirect(w, r, url, http.StatusSeeOther)
}

func RedirectWithFlash(w http.ResponseWriter, r *http.Request, url, msg, kind string) {
	SetFlash(w, msg, kind)
	Redirect(w, r, url)
}

func FormString(r *http.Request, key string) string {
	return strings.TrimSpace(r.FormValue(key))
}

func FormInt(r *http.Request, key string) (int64, bool) {
	v := strings.TrimSpace(r.FormValue(key))
	if v == "" {
		return 0, false
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return 0, false
	}
	return n, true
}

func FormDate(r *http.Request, key string) string {
	return strings.TrimSpace(r.FormValue(key))
}

func FormTime(r *http.Request, key, tz string) (string, error) {
	v := strings.TrimSpace(r.FormValue(key))
	if v == "" {
		return "", errors.New("empty")
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	t, err := time.ParseInLocation("2006-01-02T15:04", v, loc)
	if err != nil {
		return "", fmt.Errorf("parse datetime: %w", err)
	}
	return t.UTC().Format("2006-01-02T15:04:05.000000Z"), nil
}

func FormCheckboxIDs(r *http.Request, key string) []int64 {
	var ids []int64
	for _, v := range r.Form[key] {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			ids = append(ids, n)
		}
	}
	return ids
}

func Required(v, field string, errs map[string]string) {
	if strings.TrimSpace(v) == "" {
		errs[field] = "Wajib diisi"
	}
}

func MaxLen(v string, n int, field string, errs map[string]string) {
	if len(v) > n {
		errs[field] = fmt.Sprintf("Maksimal %d karakter", n)
	}
}

func MinLen(v string, n int, field string, errs map[string]string) {
	if len([]rune(v)) < n {
		errs[field] = fmt.Sprintf("Minimal %d karakter", n)
	}
}

func ValidEmail(v, field string, errs map[string]string) {
	if strings.TrimSpace(v) == "" {
		return
	}
	if _, err := mail.ParseAddress(v); err != nil {
		errs[field] = "Format email tidak valid"
	}
}

func OneOf(v string, allowed []string, field string, errs map[string]string) {
	if strings.TrimSpace(v) == "" {
		return
	}
	for _, a := range allowed {
		if v == a {
			return
		}
	}
	errs[field] = "Nilai tidak valid"
}

func PastDate(v, field string, errs map[string]string) {
	if strings.TrimSpace(v) == "" {
		return
	}
	t, err := time.Parse("2006-01-02", v)
	if err != nil {
		errs[field] = "Format tanggal tidak valid (YYYY-MM-DD)"
		return
	}
	if t.After(time.Now().UTC().Truncate(24 * time.Hour)) {
		errs[field] = "Tanggal tidak boleh di masa depan"
	}
}

func OptionalDate(v, field string, errs map[string]string) (sql.NullString, bool) {
	v = strings.TrimSpace(v)
	if v == "" {
		return sql.NullString{}, true
	}
	if _, err := time.Parse("2006-01-02", v); err != nil {
		errs[field] = "Format tanggal tidak valid (YYYY-MM-DD)"
		return sql.NullString{}, false
	}
	return sql.NullString{String: v, Valid: true}, true
}

func NullStringFromForm(v string) sql.NullString {
	v = strings.TrimSpace(v)
	if v == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: v, Valid: true}
}

func NullInt64FromOptional(id int64, ok bool) sql.NullInt64 {
	if !ok || id == 0 {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: id, Valid: true}
}

func ParseChiID(r *http.Request) (int64, error) {
	idStr := chi.URLParam(r, "id")
	if idStr == "" {
		return 0, fmt.Errorf("missing id")
	}
	return strconv.ParseInt(idStr, 10, 64)
}

func WriteNotFound(w http.ResponseWriter) {
	http.NotFound(w, nil)
}

func WriteServerError(w http.ResponseWriter, err error) {
	slog.Error("handler error", "err", err)
	http.Error(w, "server error", http.StatusInternalServerError)
}

func IsUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "UNIQUE constraint failed")
}

func formatDateTime(utcISO, tz, layout string) string {
	if utcISO == "" {
		return ""
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	t, err := time.Parse("2006-01-02T15:04:05.000000Z", utcISO)
	if err != nil {
		t, err = time.Parse(time.RFC3339, utcISO)
		if err != nil {
			return utcISO
		}
	}
	if layout == "" {
		layout = "02 Jan 2006 15:04"
	}
	return t.In(loc).Format(layout)
}

func toLocalInput(utcISO, tz string) string {
	if utcISO == "" {
		return ""
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	t, err := time.Parse("2006-01-02T15:04:05.000000Z", utcISO)
	if err != nil {
		t, err = time.Parse(time.RFC3339, utcISO)
		if err != nil {
			return ""
		}
	}
	return t.In(loc).Format("2006-01-02T15:04")
}

func add(a, b int64) int64 { return a + b }

func sub(a, b int64) int64 { return a - b }

func derefString(ns sql.NullString) string {
	if ns.Valid {
		return ns.String
	}
	return ""
}

func nullInt64(ni sql.NullInt64) string {
	if ni.Valid {
		return strconv.FormatInt(ni.Int64, 10)
	}
	return ""
}

func DateRangeUTC(from, to, tz string) (startUTC, endUTC string, err error) {
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	if from != "" {
		t, e := time.ParseInLocation("2006-01-02", from, loc)
		if e != nil {
			return "", "", fmt.Errorf("parse from: %w", e)
		}
		startUTC = t.UTC().Format("2006-01-02T15:04:05.000000Z")
	}
	if to != "" {
		t, e := time.ParseInLocation("2006-01-02", to, loc)
		if e != nil {
			return "", "", fmt.Errorf("parse to: %w", e)
		}
		end := t.Add(24*time.Hour - time.Nanosecond)
		endUTC = end.UTC().Format("2006-01-02T15:04:05.000000Z")
	}
	return startUTC, endUTC, nil
}

func LoadUser(ctx context.Context, q *sqlc.Queries, r *http.Request) (sqlc.User, error) {
	uid := UserID(r)
	if uid == 0 {
		return sqlc.User{}, fmt.Errorf("missing user")
	}
	return q.GetUserByID(ctx, uid)
}

func CompareDates(a, b string) int {
	ta, _ := time.Parse("2006-01-02", a)
	tb, _ := time.Parse("2006-01-02", b)
	return ta.Compare(tb)
}
