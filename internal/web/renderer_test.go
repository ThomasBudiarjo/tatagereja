package web

import "testing"

func TestNewRendererParses(t *testing.T) {
	r := NewRenderer()
	if r.tmpl.Lookup("layout") == nil {
		t.Fatal("layout template missing")
	}
	if r.tmpl.Lookup("jemaat/list.html") == nil {
		t.Fatal("jemaat/list.html template missing")
	}
}
