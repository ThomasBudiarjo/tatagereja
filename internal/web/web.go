package web

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"database/sql"

	"github.com/go-chi/chi/v5"

	"github.com/tatagereja/tatagereja/internal/db/sqlc"
)

const (
	defaultPageSize = 50
	maxPageSize     = 100
)

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
