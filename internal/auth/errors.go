package auth

import "errors"

// ErrInvalidCredentials is returned for any login failure — unknown email,
// wrong password, or missing user — so callers cannot distinguish them.
var ErrInvalidCredentials = errors.New("invalid email or password")

// ErrEmailTaken is returned when registering an email that already exists.
var ErrEmailTaken = errors.New("email already registered")
