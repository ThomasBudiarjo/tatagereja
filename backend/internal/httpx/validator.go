package httpx

import (
	"reflect"

	"github.com/go-playground/validator/v10"
	"gopkg.in/guregu/null.v4"
)

// NewValidator returns a *validator.Validate configured to understand the
// guregu/null types we use in request bodies. Without these custom type
// funcs, validators like `max`, `email`, `datetime`, and `oneof` panic with
// "Bad field type null.String" because the validator can't introspect the
// wrapper struct directly.
//
// Custom type funcs unwrap a null.X value to the underlying scalar — or to
// nil when the value is invalid — so that `omitempty` short-circuits and
// every other tag operates on the inner scalar as if it had been declared
// directly.
func NewValidator() *validator.Validate {
	v := validator.New()
	v.RegisterCustomTypeFunc(nullStringValuer, null.String{})
	v.RegisterCustomTypeFunc(nullIntValuer, null.Int{})
	v.RegisterCustomTypeFunc(nullBoolValuer, null.Bool{})
	v.RegisterCustomTypeFunc(nullFloatValuer, null.Float{})
	v.RegisterCustomTypeFunc(nullTimeValuer, null.Time{})
	return v
}

func nullStringValuer(field reflect.Value) interface{} {
	if ns, ok := field.Interface().(null.String); ok && ns.Valid {
		return ns.String
	}
	return nil
}

func nullIntValuer(field reflect.Value) interface{} {
	if ni, ok := field.Interface().(null.Int); ok && ni.Valid {
		return ni.Int64
	}
	return nil
}

func nullBoolValuer(field reflect.Value) interface{} {
	if nb, ok := field.Interface().(null.Bool); ok && nb.Valid {
		return nb.Bool
	}
	return nil
}

func nullFloatValuer(field reflect.Value) interface{} {
	if nf, ok := field.Interface().(null.Float); ok && nf.Valid {
		return nf.Float64
	}
	return nil
}

func nullTimeValuer(field reflect.Value) interface{} {
	if nt, ok := field.Interface().(null.Time); ok && nt.Valid {
		return nt.Time
	}
	return nil
}
