package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func writeValidationError(w http.ResponseWriter, err error) {
	var verrs validator.ValidationErrors
	if errors.As(err, &verrs) && len(verrs) > 0 {
		first := verrs[0]
		msg := first.Field() + " failed validation (" + first.Tag() + ")"
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	writeError(w, http.StatusBadRequest, "validation failed")
}

func parsePagination(r *http.Request) (limit, offset int64) {
	limit = 50
	offset = 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n >= 0 {
			offset = n
		}
	}
	return
}

func parseIDParam(r *http.Request, key string) (int64, bool) {
	raw := strings.TrimSpace(chi.URLParam(r, key))
	if raw == "" {
		return 0, false
	}
	n, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || n <= 0 {
		return 0, false
	}
	return n, true
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return false
	}
	return true
}
