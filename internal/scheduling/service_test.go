package scheduling_test

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"github.com/thomasbudiarjo/tatagereja/internal/db"
	"github.com/thomasbudiarjo/tatagereja/internal/db/gen"
	"github.com/thomasbudiarjo/tatagereja/internal/scheduling"
)

type noopNotifier struct{}

func (noopNotifier) NotifyWrite() {}

func newService(t *testing.T) (*scheduling.Service, *db.Store) {
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
	store := db.NewStore(conn, noopNotifier{})
	return scheduling.NewService(store), store
}

func addPerson(t *testing.T, store *db.Store, name string) gen.Person {
	t.Helper()
	ctx := context.Background()
	var p gen.Person
	err := store.Tx(ctx, func(q *gen.Queries) error {
		created, err := q.CreatePerson(ctx, gen.CreatePersonParams{ID: db.NewID(), Name: name})
		p = created
		return err
	})
	if err != nil {
		t.Fatalf("CreatePerson: %v", err)
	}
	return p
}

func validInput() scheduling.ServiceInput {
	return scheduling.ServiceInput{
		PelayananTypeCode: "ibadah_umum",
		Date:              "2026-07-05",
		StartTime:         "09:00",
		Title:             "Ibadah Raya",
	}
}

func TestCreateServiceValidation(t *testing.T) {
	svc, _ := newService(t)
	ctx := context.Background()

	cases := []struct {
		name   string
		mutate func(*scheduling.ServiceInput)
	}{
		{"bad date", func(in *scheduling.ServiceInput) { in.Date = "05-07-2026" }},
		{"bad time", func(in *scheduling.ServiceInput) { in.StartTime = "9am" }},
		{"empty type", func(in *scheduling.ServiceInput) { in.PelayananTypeCode = " " }},
	}
	for _, tc := range cases {
		in := validInput()
		tc.mutate(&in)
		if _, err := svc.CreateService(ctx, in); !errors.Is(err, scheduling.ErrValidation) {
			t.Fatalf("%s: err=%v, want ErrValidation", tc.name, err)
		}
	}

	if _, err := svc.CreateService(ctx, validInput()); err != nil {
		t.Fatalf("valid input: %v", err)
	}
}

func TestCreateServiceUnknownType(t *testing.T) {
	svc, _ := newService(t)
	in := validInput()
	in.PelayananTypeCode = "nonexistent"
	if _, err := svc.CreateService(context.Background(), in); !errors.Is(err, scheduling.ErrUnknownRef) {
		t.Fatalf("err=%v, want ErrUnknownRef", err)
	}
}

func TestAssignWarnsOnSameDayConflict(t *testing.T) {
	svc, store := newService(t)
	ctx := context.Background()

	budi := addPerson(t, store, "Budi")
	morning, err := svc.CreateService(ctx, validInput())
	if err != nil {
		t.Fatalf("create morning: %v", err)
	}
	eveningIn := validInput()
	eveningIn.StartTime = "17:00"
	evening, err := svc.CreateService(ctx, eveningIn)
	if err != nil {
		t.Fatalf("create evening: %v", err)
	}

	_, warnings, err := svc.Assign(ctx, morning.ID, budi.ID, "singer")
	if err != nil {
		t.Fatalf("first assign: %v", err)
	}
	if len(warnings) != 0 {
		t.Fatalf("first assign warnings=%v, want none", warnings)
	}

	// Same person, same service, second role: no conflict warning either.
	_, warnings, err = svc.Assign(ctx, morning.ID, budi.ID, "worship_leader")
	if err != nil {
		t.Fatalf("second role assign: %v", err)
	}
	if len(warnings) != 0 {
		t.Fatalf("same-service second role warnings=%v, want none", warnings)
	}

	// Same person on another same-date service: warn but do not block.
	a, warnings, err := svc.Assign(ctx, evening.ID, budi.ID, "singer")
	if err != nil {
		t.Fatalf("conflicting assign: %v", err)
	}
	if a.PersonName != "Budi" || a.RoleName != "Singer" {
		t.Fatalf("assignment names=%+v", a)
	}
	if len(warnings) != 2 {
		t.Fatalf("warnings=%v, want 2 (both morning roles)", warnings)
	}
	if !strings.Contains(warnings[0], "Budi") || !strings.Contains(warnings[0], "09:00") {
		t.Fatalf("warning text=%q", warnings[0])
	}
}

func TestAssignDuplicateAndUnknownRefs(t *testing.T) {
	svc, store := newService(t)
	ctx := context.Background()

	budi := addPerson(t, store, "Budi")
	service, _ := svc.CreateService(ctx, validInput())

	if _, _, err := svc.Assign(ctx, service.ID, budi.ID, "singer"); err != nil {
		t.Fatalf("assign: %v", err)
	}
	if _, _, err := svc.Assign(ctx, service.ID, budi.ID, "singer"); !errors.Is(err, scheduling.ErrDuplicateAssignment) {
		t.Fatalf("duplicate err=%v, want ErrDuplicateAssignment", err)
	}
	if _, _, err := svc.Assign(ctx, service.ID, "missing-person", "singer"); !errors.Is(err, scheduling.ErrUnknownRef) {
		t.Fatalf("unknown person err=%v, want ErrUnknownRef", err)
	}
	if _, _, err := svc.Assign(ctx, service.ID, budi.ID, "missing-role"); !errors.Is(err, scheduling.ErrUnknownRef) {
		t.Fatalf("unknown role err=%v, want ErrUnknownRef", err)
	}
	if _, _, err := svc.Assign(ctx, "missing-service", budi.ID, "singer"); !errors.Is(err, scheduling.ErrNotFound) {
		t.Fatalf("missing service err=%v, want ErrNotFound", err)
	}
}

func TestListServicesWithAssignmentsGroups(t *testing.T) {
	svc, store := newService(t)
	ctx := context.Background()

	budi := addPerson(t, store, "Budi")
	first, _ := svc.CreateService(ctx, validInput())
	secondIn := validInput()
	secondIn.Date = "2026-07-12"
	second, _ := svc.CreateService(ctx, secondIn)
	if _, _, err := svc.Assign(ctx, first.ID, budi.ID, "singer"); err != nil {
		t.Fatalf("assign: %v", err)
	}

	list, err := svc.ListServicesWithAssignments(ctx, "2026-07-01", "2026-07-31")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("services=%d, want 2", len(list))
	}
	if list[0].Service.ID != first.ID || len(list[0].Assignments) != 1 {
		t.Fatalf("first service roster=%+v", list[0])
	}
	if list[0].Assignments[0].PersonName != "Budi" {
		t.Fatalf("roster name=%q", list[0].Assignments[0].PersonName)
	}
	if list[1].Service.ID != second.ID || len(list[1].Assignments) != 0 {
		t.Fatalf("second service roster=%+v", list[1])
	}
	if list[0].PelayananTypeName != "Ibadah Umum" {
		t.Fatalf("type name=%q", list[0].PelayananTypeName)
	}
}

func TestUpdateAndDeleteService(t *testing.T) {
	svc, _ := newService(t)
	ctx := context.Background()

	created, _ := svc.CreateService(ctx, validInput())
	in := validInput()
	in.Title = "Ibadah Natal"
	updated, err := svc.UpdateService(ctx, created.ID, in)
	if err != nil || updated.Title != "Ibadah Natal" {
		t.Fatalf("update: %v title=%q", err, updated.Title)
	}
	if _, err := svc.UpdateService(ctx, "missing", in); !errors.Is(err, scheduling.ErrNotFound) {
		t.Fatalf("update missing err=%v, want ErrNotFound", err)
	}

	if err := svc.DeleteService(ctx, created.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := svc.GetServiceWithAssignments(ctx, created.ID); !errors.Is(err, scheduling.ErrNotFound) {
		t.Fatalf("get deleted err=%v, want ErrNotFound", err)
	}
}
