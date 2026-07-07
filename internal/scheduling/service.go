// Package scheduling implements the worship service roster use cases:
// services (ibadah), person-to-role assignments, and double-booking warnings.
package scheduling

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/thomasbudiarjo/tatagereja/internal/db"
	"github.com/thomasbudiarjo/tatagereja/internal/db/gen"
)

// Service owns roster logic over the data store.
type Service struct {
	store *db.Store
}

// NewService wires the scheduling service over the data store.
func NewService(store *db.Store) *Service {
	return &Service{store: store}
}

// ServiceInput carries the editable fields of a worship service.
type ServiceInput struct {
	PelayananTypeCode string
	Date              string // YYYY-MM-DD
	StartTime         string // HH:MM
	Title             string
	Notes             string
}

// ServiceWithAssignments is a worship service plus its roster.
type ServiceWithAssignments struct {
	Service           gen.Service
	PelayananTypeName string
	Assignments       []Assignment
}

// Assignment is a roster entry with display names resolved.
type Assignment struct {
	ID         string
	PersonID   string
	PersonName string
	RoleCode   string
	RoleName   string
}

func (in *ServiceInput) validate() error {
	in.PelayananTypeCode = strings.TrimSpace(in.PelayananTypeCode)
	in.Title = strings.TrimSpace(in.Title)
	if in.PelayananTypeCode == "" {
		return fmt.Errorf("%w: jenis pelayanan wajib diisi", ErrValidation)
	}
	if _, err := time.Parse("2006-01-02", in.Date); err != nil {
		return fmt.Errorf("%w: format tanggal harus YYYY-MM-DD", ErrValidation)
	}
	if _, err := time.Parse("15:04", in.StartTime); err != nil {
		return fmt.Errorf("%w: format jam harus HH:MM", ErrValidation)
	}
	return nil
}

// isConstraintErr reports whether err is the given SQLite constraint failure.
// modernc.org/sqlite does not expose these as typed errors ergonomically, so
// this matches the stable message prefix; tests cover it against the driver.
func isConstraintErr(err error, kind string) bool {
	return err != nil && strings.Contains(err.Error(), kind+" constraint failed")
}

// CreateService validates the input and stores a new worship service.
func (s *Service) CreateService(ctx context.Context, in ServiceInput) (gen.Service, error) {
	if err := in.validate(); err != nil {
		return gen.Service{}, err
	}
	var svc gen.Service
	err := s.store.Tx(ctx, func(q *gen.Queries) error {
		created, err := q.CreateService(ctx, gen.CreateServiceParams{
			ID:                db.NewID(),
			PelayananTypeCode: in.PelayananTypeCode,
			ServiceDate:       in.Date,
			StartTime:         in.StartTime,
			Title:             in.Title,
			Notes:             in.Notes,
		})
		svc = created
		return err
	})
	if isConstraintErr(err, "FOREIGN KEY") {
		return gen.Service{}, fmt.Errorf("%w: jenis pelayanan tidak dikenal", ErrUnknownRef)
	}
	return svc, err
}

// UpdateService validates the input and updates an existing service.
func (s *Service) UpdateService(ctx context.Context, id string, in ServiceInput) (gen.Service, error) {
	if err := in.validate(); err != nil {
		return gen.Service{}, err
	}
	var svc gen.Service
	err := s.store.Tx(ctx, func(q *gen.Queries) error {
		updated, err := q.UpdateService(ctx, gen.UpdateServiceParams{
			PelayananTypeCode: in.PelayananTypeCode,
			ServiceDate:       in.Date,
			StartTime:         in.StartTime,
			Title:             in.Title,
			Notes:             in.Notes,
			ID:                id,
		})
		svc = updated
		return err
	})
	switch {
	case errors.Is(err, sql.ErrNoRows):
		return gen.Service{}, ErrNotFound
	case isConstraintErr(err, "FOREIGN KEY"):
		return gen.Service{}, fmt.Errorf("%w: jenis pelayanan tidak dikenal", ErrUnknownRef)
	}
	return svc, err
}

// DeleteService removes a service; its assignments cascade.
func (s *Service) DeleteService(ctx context.Context, id string) error {
	return s.store.Tx(ctx, func(q *gen.Queries) error {
		return q.DeleteService(ctx, id)
	})
}

// GetServiceWithAssignments loads one service and its roster.
func (s *Service) GetServiceWithAssignments(ctx context.Context, id string) (ServiceWithAssignments, error) {
	row, err := s.store.GetService(ctx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return ServiceWithAssignments{}, ErrNotFound
	}
	if err != nil {
		return ServiceWithAssignments{}, err
	}
	rows, err := s.store.ListAssignmentsByService(ctx, id)
	if err != nil {
		return ServiceWithAssignments{}, err
	}
	out := ServiceWithAssignments{
		Service: gen.Service{
			ID:                row.ID,
			PelayananTypeCode: row.PelayananTypeCode,
			ServiceDate:       row.ServiceDate,
			StartTime:         row.StartTime,
			Title:             row.Title,
			Notes:             row.Notes,
			CreatedAt:         row.CreatedAt,
			UpdatedAt:         row.UpdatedAt,
		},
		PelayananTypeName: row.PelayananTypeName,
		Assignments:       make([]Assignment, 0, len(rows)),
	}
	for _, a := range rows {
		out.Assignments = append(out.Assignments, Assignment{
			ID: a.ID, PersonID: a.PersonID, PersonName: a.PersonName,
			RoleCode: a.RoleCode, RoleName: a.RoleName,
		})
	}
	return out, nil
}

// ListServicesWithAssignments returns the services in [from, to] (inclusive,
// YYYY-MM-DD) with their rosters attached.
func (s *Service) ListServicesWithAssignments(ctx context.Context, from, to string) ([]ServiceWithAssignments, error) {
	services, err := s.store.ListServicesBetween(ctx, gen.ListServicesBetweenParams{FromDate: from, ToDate: to})
	if err != nil {
		return nil, err
	}
	assignments, err := s.store.ListAssignmentsBetween(ctx, gen.ListAssignmentsBetweenParams{FromDate: from, ToDate: to})
	if err != nil {
		return nil, err
	}
	byService := make(map[string][]Assignment)
	for _, a := range assignments {
		byService[a.ServiceID] = append(byService[a.ServiceID], Assignment{
			ID: a.ID, PersonID: a.PersonID, PersonName: a.PersonName,
			RoleCode: a.RoleCode, RoleName: a.RoleName,
		})
	}
	out := make([]ServiceWithAssignments, 0, len(services))
	for _, row := range services {
		roster := byService[row.ID]
		if roster == nil {
			roster = []Assignment{}
		}
		out = append(out, ServiceWithAssignments{
			Service: gen.Service{
				ID:                row.ID,
				PelayananTypeCode: row.PelayananTypeCode,
				ServiceDate:       row.ServiceDate,
				StartTime:         row.StartTime,
				Title:             row.Title,
				Notes:             row.Notes,
				CreatedAt:         row.CreatedAt,
				UpdatedAt:         row.UpdatedAt,
			},
			PelayananTypeName: row.PelayananTypeName,
			Assignments:       roster,
		})
	}
	return out, nil
}

// Assign adds a person to a role in a service. It returns warnings when the
// person is already scheduled in another service on the same date; warnings
// never block the assignment.
func (s *Service) Assign(ctx context.Context, serviceID, personID, roleCode string) (Assignment, []string, error) {
	svcRow, err := s.store.GetService(ctx, serviceID)
	if errors.Is(err, sql.ErrNoRows) {
		return Assignment{}, nil, ErrNotFound
	}
	if err != nil {
		return Assignment{}, nil, err
	}

	var created gen.Assignment
	err = s.store.Tx(ctx, func(q *gen.Queries) error {
		a, err := q.CreateAssignment(ctx, gen.CreateAssignmentParams{
			ID: db.NewID(), ServiceID: serviceID, PersonID: personID, RoleCode: roleCode,
		})
		created = a
		return err
	})
	switch {
	case isConstraintErr(err, "UNIQUE"):
		return Assignment{}, nil, ErrDuplicateAssignment
	case isConstraintErr(err, "FOREIGN KEY"):
		return Assignment{}, nil, fmt.Errorf("%w: jemaat atau peran tidak dikenal", ErrUnknownRef)
	case err != nil:
		return Assignment{}, nil, err
	}

	person, err := s.store.GetPerson(ctx, personID)
	if err != nil {
		return Assignment{}, nil, err
	}
	role, err := s.store.GetServingRole(ctx, roleCode)
	if err != nil {
		return Assignment{}, nil, err
	}

	conflicts, err := s.store.ListPersonAssignmentsOnDate(ctx, gen.ListPersonAssignmentsOnDateParams{
		PersonID: personID, ServiceDate: svcRow.ServiceDate, ID: serviceID,
	})
	if err != nil {
		return Assignment{}, nil, err
	}
	warnings := make([]string, 0, len(conflicts))
	for _, c := range conflicts {
		warnings = append(warnings, fmt.Sprintf(
			"%s sudah terjadwal sebagai %s di %s %s pada tanggal yang sama",
			person.Name, c.RoleName, c.PelayananTypeName, c.StartTime,
		))
	}

	return Assignment{
		ID: created.ID, PersonID: person.ID, PersonName: person.Name,
		RoleCode: role.Code, RoleName: role.Name,
	}, warnings, nil
}

// Unassign removes an assignment from a service.
func (s *Service) Unassign(ctx context.Context, serviceID, assignmentID string) error {
	return s.store.Tx(ctx, func(q *gen.Queries) error {
		return q.DeleteAssignment(ctx, gen.DeleteAssignmentParams{ID: assignmentID, ServiceID: serviceID})
	})
}
