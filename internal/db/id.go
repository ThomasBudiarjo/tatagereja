package db

import (
	"crypto/rand"
	"encoding/base64"
)

// NewID returns a random 128-bit identifier encoded as 22 base64url characters.
// It is the canonical ID generator for all application tables.
func NewID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic("db: cannot read random bytes: " + err.Error())
	}
	return base64.RawURLEncoding.EncodeToString(b)
}
