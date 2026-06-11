package auth

import (
	"database/sql"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"golang.org/x/crypto/bcrypt"

	"github.com/thomasbudiarjo/tatagereja/internal/db"
	"github.com/thomasbudiarjo/tatagereja/internal/httpx"
)

// Register creates a new church together with its owner account. This is how
// the first (and any subsequent) church gets onboarded.
func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ChurchName string `json:"church_name"`
		Name       string `json:"name"`
		Email      string `json:"email"`
		Password   string `json:"password"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	in.ChurchName = strings.TrimSpace(in.ChurchName)
	in.Name = strings.TrimSpace(in.Name)
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	switch {
	case in.ChurchName == "":
		httpx.Error(w, http.StatusBadRequest, "church_name is required")
		return
	case in.Name == "":
		httpx.Error(w, http.StatusBadRequest, "name is required")
		return
	case !strings.Contains(in.Email, "@"):
		httpx.Error(w, http.StatusBadRequest, "a valid email is required")
		return
	case len(in.Password) < 8:
		httpx.Error(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	var n int
	if err := h.DB.QueryRow(`SELECT COUNT(*) FROM users WHERE email = ?`, in.Email).Scan(&n); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	if n > 0 {
		httpx.Error(w, http.StatusConflict, "email is already registered")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not hash password")
		return
	}

	churchID, userID, now := db.NewID(), db.NewID(), db.Now()
	// Resolve the slug before Begin: with a single pooled connection, a
	// query issued while the transaction holds it would deadlock.
	slug := h.uniqueSlug(in.ChurchName)
	tx, err := h.DB.Begin()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`INSERT INTO churches (id, name, slug, address, created_at, updated_at) VALUES (?, ?, ?, '', ?, ?)`,
		churchID, in.ChurchName, slug, now, now); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create church")
		return
	}
	if _, err := tx.Exec(`INSERT INTO users (id, church_id, name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'owner', ?, ?)`,
		userID, churchID, in.Name, in.Email, string(hash), now, now); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create user")
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}

	if err := h.createSession(w, userID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create session")
		return
	}
	httpx.JSON(w, http.StatusCreated, User{ID: userID, ChurchID: churchID, Name: in.Name, Email: in.Email, Role: "owner"})
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))

	var u User
	var hash string
	err := h.DB.QueryRow(`SELECT id, church_id, name, email, role, password_hash FROM users WHERE email = ?`, in.Email).
		Scan(&u.ID, &u.ChurchID, &u.Name, &u.Email, &u.Role, &hash)
	if err == sql.ErrNoRows || (err == nil && bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) != nil) {
		httpx.Error(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}

	if err := h.createSession(w, u.ID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create session")
		return
	}
	httpx.JSON(w, http.StatusOK, u)
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	h.clearSession(w, r)
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// Me returns the authenticated user along with their church.
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	u := UserFrom(r)
	var church struct {
		ID      string `json:"id"`
		Name    string `json:"name"`
		Slug    string `json:"slug"`
		Address string `json:"address"`
	}
	if err := h.DB.QueryRow(`SELECT id, name, slug, COALESCE(address, '') FROM churches WHERE id = ?`, u.ChurchID).
		Scan(&church.ID, &church.Name, &church.Slug, &church.Address); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"user": u, "church": church})
}

var slugStrip = regexp.MustCompile(`[^a-z0-9]+`)

func (h *Handler) uniqueSlug(name string) string {
	base := strings.Trim(slugStrip.ReplaceAllString(strings.ToLower(name), "-"), "-")
	if base == "" {
		base = "church"
	}
	slug := base
	for i := 2; i <= 10; i++ {
		var n int
		if err := h.DB.QueryRow(`SELECT COUNT(*) FROM churches WHERE slug = ?`, slug).Scan(&n); err != nil || n == 0 {
			return slug
		}
		slug = fmt.Sprintf("%s-%d", base, i)
	}
	return base + "-" + db.NewID()[:8]
}
