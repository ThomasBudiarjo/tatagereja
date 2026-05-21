package web

import (
	"bytes"
	"database/sql"
	"testing"

	"github.com/tatagereja/tatagereja/internal/db/sqlc"
)

func TestNewRendererParses(t *testing.T) {
	r := NewRenderer()
	if r.tmpl.Lookup("layout") == nil {
		t.Fatal("layout template missing")
	}
	if r.tmpl.Lookup("jemaat/list.html") == nil {
		t.Fatal("jemaat/list.html template missing")
	}
}

func TestServiceTypeTemplatesExecute(t *testing.T) {
	r := NewRenderer()
	item := sqlc.ServiceType{
		ID:        7,
		Nama:      "Pemusik",
		Deskripsi: sql.NullString{String: "Pengiring ibadah", Valid: true},
		Urutan:    1,
	}

	cases := []struct {
		name string
		data any
	}{
		{
			name: "servicetypes/list.html",
			data: serviceTypeListPage{
				Items:  []sqlc.ServiceType{item},
				Form:   serviceTypeForm{Nama: "Liturgis", Urutan: "2"},
				Errors: map[string]string{},
			},
		},
		{
			name: "servicetypes/edit_row.html",
			data: serviceTypeEditPage{ID: item.ID, Form: serviceTypeForm{Nama: item.Nama, Deskripsi: item.Deskripsi.String, Urutan: "1"}},
		},
		{
			name: "servicetypes/edit_row_mobile.html",
			data: serviceTypeEditPage{ID: item.ID, Form: serviceTypeForm{Nama: item.Nama, Deskripsi: item.Deskripsi.String, Urutan: "1"}},
		},
		{
			name: "servicetypes/row.html",
			data: serviceTypeRowPage{ServiceType: item},
		},
		{
			name: "servicetypes/row_mobile.html",
			data: serviceTypeRowPage{ServiceType: item},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var buf bytes.Buffer
			if err := r.tmpl.ExecuteTemplate(&buf, tc.name, tc.data); err != nil {
				t.Fatal(err)
			}
		})
	}
}
