package db_test

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/thomasbudiarjo/tatagereja/internal/db"
	"github.com/thomasbudiarjo/tatagereja/internal/db/gen"
)

// newSeededStore opens a fresh database with migrations and seeds applied.
func newSeededStore(t *testing.T) *db.Store {
	t.Helper()
	conn, err := db.Open(filepath.Join(t.TempDir(), "sched.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	if _, err := db.Migrate(conn); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	if _, err := db.Seed(conn); err != nil {
		t.Fatalf("Seed: %v", err)
	}
	return db.NewStore(conn, &countingNotifier{})
}

func createPerson(t *testing.T, store *db.Store, name string) gen.Person {
	t.Helper()
	ctx := context.Background()
	var person gen.Person
	err := store.Tx(ctx, func(q *gen.Queries) error {
		p, err := q.CreatePerson(ctx, gen.CreatePersonParams{ID: db.NewID(), Name: name})
		person = p
		return err
	})
	if err != nil {
		t.Fatalf("CreatePerson(%s): %v", name, err)
	}
	return person
}

func createService(t *testing.T, store *db.Store, date, startTime string) gen.Service {
	t.Helper()
	ctx := context.Background()
	var svc gen.Service
	err := store.Tx(ctx, func(q *gen.Queries) error {
		s, err := q.CreateService(ctx, gen.CreateServiceParams{
			ID:                db.NewID(),
			PelayananTypeCode: "ibadah_umum",
			ServiceDate:       date,
			StartTime:         startTime,
		})
		svc = s
		return err
	})
	if err != nil {
		t.Fatalf("CreateService(%s %s): %v", date, startTime, err)
	}
	return svc
}

func createAssignment(t *testing.T, store *db.Store, serviceID, personID, roleCode string) gen.Assignment {
	t.Helper()
	ctx := context.Background()
	var a gen.Assignment
	err := store.Tx(ctx, func(q *gen.Queries) error {
		created, err := q.CreateAssignment(ctx, gen.CreateAssignmentParams{
			ID: db.NewID(), ServiceID: serviceID, PersonID: personID, RoleCode: roleCode,
		})
		a = created
		return err
	})
	if err != nil {
		t.Fatalf("CreateAssignment: %v", err)
	}
	return a
}

func TestSeededServingRoles(t *testing.T) {
	store := newSeededStore(t)
	roles, err := store.ListServingRoles(context.Background())
	if err != nil {
		t.Fatalf("ListServingRoles: %v", err)
	}
	if len(roles) != 9 {
		t.Fatalf("seeded roles=%d, want 9", len(roles))
	}
	if roles[0].Code != "worship_leader" {
		t.Fatalf("first role=%s, want worship_leader (sort_order)", roles[0].Code)
	}
}

func TestPersonCRUD(t *testing.T) {
	store := newSeededStore(t)
	ctx := context.Background()

	p := createPerson(t, store, "Budi")
	got, err := store.GetPerson(ctx, p.ID)
	if err != nil || got.Name != "Budi" {
		t.Fatalf("GetPerson: %v, name=%q", err, got.Name)
	}

	err = store.Tx(ctx, func(q *gen.Queries) error {
		_, err := q.UpdatePerson(ctx, gen.UpdatePersonParams{
			Name: "Budi Santoso", Phone: "0812", Notes: "tenor", ID: p.ID,
		})
		return err
	})
	if err != nil {
		t.Fatalf("UpdatePerson: %v", err)
	}
	got, _ = store.GetPerson(ctx, p.ID)
	if got.Name != "Budi Santoso" || got.Phone != "0812" {
		t.Fatalf("update not applied: %+v", got)
	}

	createPerson(t, store, "andi") // lowercase sorts before Budi with NOCASE
	list, err := store.ListPersons(ctx)
	if err != nil || len(list) != 2 {
		t.Fatalf("ListPersons: %v, len=%d", err, len(list))
	}
	if list[0].Name != "andi" {
		t.Fatalf("expected case-insensitive name order, got %q first", list[0].Name)
	}

	if err := store.Tx(ctx, func(q *gen.Queries) error { return q.DeletePerson(ctx, p.ID) }); err != nil {
		t.Fatalf("DeletePerson: %v", err)
	}
	if _, err := store.GetPerson(ctx, p.ID); err == nil {
		t.Fatal("expected deleted person to be absent")
	}
}

func TestListServicesBetweenBoundaries(t *testing.T) {
	store := newSeededStore(t)
	ctx := context.Background()

	createService(t, store, "2026-07-05", "09:00")
	createService(t, store, "2026-07-12", "09:00")
	createService(t, store, "2026-07-13", "19:00")

	rows, err := store.ListServicesBetween(ctx, gen.ListServicesBetweenParams{
		FromDate: "2026-07-05", ToDate: "2026-07-12",
	})
	if err != nil {
		t.Fatalf("ListServicesBetween: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("services in range=%d, want 2 (inclusive bounds)", len(rows))
	}
	if rows[0].PelayananTypeName != "Ibadah Umum" {
		t.Fatalf("joined type name=%q, want Ibadah Umum", rows[0].PelayananTypeName)
	}
}

func TestAssignmentUniqueViolation(t *testing.T) {
	store := newSeededStore(t)
	ctx := context.Background()

	p := createPerson(t, store, "Budi")
	svc := createService(t, store, "2026-07-05", "09:00")
	createAssignment(t, store, svc.ID, p.ID, "singer")

	err := store.Tx(ctx, func(q *gen.Queries) error {
		_, err := q.CreateAssignment(ctx, gen.CreateAssignmentParams{
			ID: db.NewID(), ServiceID: svc.ID, PersonID: p.ID, RoleCode: "singer",
		})
		return err
	})
	if err == nil || !strings.Contains(err.Error(), "UNIQUE constraint failed") {
		t.Fatalf("expected UNIQUE violation, got %v", err)
	}
}

func TestPersonDeleteCascadesAssignments(t *testing.T) {
	store := newSeededStore(t)
	ctx := context.Background()

	p := createPerson(t, store, "Budi")
	svc := createService(t, store, "2026-07-05", "09:00")
	createAssignment(t, store, svc.ID, p.ID, "singer")

	if err := store.Tx(ctx, func(q *gen.Queries) error { return q.DeletePerson(ctx, p.ID) }); err != nil {
		t.Fatalf("DeletePerson: %v", err)
	}
	rows, err := store.ListAssignmentsByService(ctx, svc.ID)
	if err != nil {
		t.Fatalf("ListAssignmentsByService: %v", err)
	}
	if len(rows) != 0 {
		t.Fatalf("assignments after person delete=%d, want 0", len(rows))
	}
}

func TestRoleDeleteRestrictedWhenInUse(t *testing.T) {
	store := newSeededStore(t)
	ctx := context.Background()

	p := createPerson(t, store, "Budi")
	svc := createService(t, store, "2026-07-05", "09:00")
	createAssignment(t, store, svc.ID, p.ID, "singer")

	err := store.Tx(ctx, func(q *gen.Queries) error { return q.DeleteServingRole(ctx, "singer") })
	if err == nil || !strings.Contains(err.Error(), "FOREIGN KEY constraint failed") {
		t.Fatalf("expected FK violation deleting role in use, got %v", err)
	}
}

func TestListPersonAssignmentsOnDate(t *testing.T) {
	store := newSeededStore(t)
	ctx := context.Background()

	p := createPerson(t, store, "Budi")
	morning := createService(t, store, "2026-07-05", "09:00")
	evening := createService(t, store, "2026-07-05", "17:00")
	otherDay := createService(t, store, "2026-07-12", "09:00")
	createAssignment(t, store, morning.ID, p.ID, "singer")
	createAssignment(t, store, otherDay.ID, p.ID, "singer")

	rows, err := store.ListPersonAssignmentsOnDate(ctx, gen.ListPersonAssignmentsOnDateParams{
		PersonID: p.ID, ServiceDate: "2026-07-05", ID: evening.ID,
	})
	if err != nil {
		t.Fatalf("ListPersonAssignmentsOnDate: %v", err)
	}
	if len(rows) != 1 || rows[0].ServiceID != morning.ID {
		t.Fatalf("conflicts=%+v, want just the same-day morning service", rows)
	}
}
