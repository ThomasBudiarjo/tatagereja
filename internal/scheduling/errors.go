package scheduling

import "errors"

var (
	// ErrNotFound reports a missing service or assignment.
	ErrNotFound = errors.New("scheduling: not found")
	// ErrValidation reports an invalid date, time, or reference in the input.
	ErrValidation = errors.New("scheduling: invalid input")
	// ErrDuplicateAssignment reports a person already assigned to the same role
	// in the same service.
	ErrDuplicateAssignment = errors.New("scheduling: duplicate assignment")
	// ErrUnknownRef reports an unknown person, role, or pelayanan type.
	ErrUnknownRef = errors.New("scheduling: unknown reference")
)
