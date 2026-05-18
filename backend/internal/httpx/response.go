package httpx

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-playground/validator/v10"
)

type ErrorResponse struct {
	Error  string            `json:"error"`
	Fields map[string]string `json:"fields,omitempty"`
}

func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func WriteError(w http.ResponseWriter, status int, msg string) {
	WriteJSON(w, status, ErrorResponse{Error: msg})
}

func WriteValidationError(w http.ResponseWriter, err error) {
	fields := map[string]string{}
	var ves validator.ValidationErrors
	if errors.As(err, &ves) {
		for _, fe := range ves {
			fields[fe.Field()] = fe.Tag()
		}
	}
	WriteJSON(w, http.StatusBadRequest, ErrorResponse{
		Error:  "validation failed",
		Fields: fields,
	})
}
