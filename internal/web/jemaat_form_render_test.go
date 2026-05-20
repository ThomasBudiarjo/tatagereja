package web

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestJemaatFormPageRenders(t *testing.T) {
	r := NewRenderer()
	data := jemaatFormPage{
		Title:  "Tambah Jemaat",
		Form:   jemaatForm{},
		IsEdit: false,
	}
	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/jemaat/new", nil)
	if err := r.Page(w, req, "jemaat/form.html", data); err != nil {
		t.Fatal(err)
	}
	body := w.Body.String()
	if !strings.Contains(body, "Tambah Jemaat") {
		t.Fatalf("expected Tambah Jemaat in body, got len=%d", len(body))
	}
}
