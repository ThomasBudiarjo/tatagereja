// Package family implements families (Keluarga) and member relationships.
package family

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/thomasbudiarjo/tatagereja/internal/auth"
	"github.com/thomasbudiarjo/tatagereja/internal/db"
	"github.com/thomasbudiarjo/tatagereja/internal/httpx"
)

var validRelations = map[string]bool{
	"father": true, "mother": true, "child": true, "spouse": true, "sibling": true, "other": true,
}

type Family struct {
	ID           string `json:"id"`
	FamilyName   string `json:"family_name"`
	HeadMemberID string `json:"head_member_id"`
	HeadName     string `json:"head_name"`
	MemberCount  int    `json:"member_count"`
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
}

type FamilyMember struct {
	ID       string `json:"id"`
	MemberID string `json:"member_id"`
	FullName string `json:"full_name"`
	Relation string `json:"relation"`
}

type Handler struct{ DB *sql.DB }

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(`
		SELECT f.id, f.family_name, COALESCE(f.head_member_id,''), COALESCE(m.full_name,''),
		       (SELECT COUNT(*) FROM family_members fm WHERE fm.family_id = f.id),
		       f.created_at, f.updated_at
		FROM families f
		LEFT JOIN members m ON m.id = f.head_member_id
		WHERE f.church_id = ?
		ORDER BY f.family_name COLLATE NOCASE`, auth.ChurchID(r))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()
	families := []Family{}
	for rows.Next() {
		var f Family
		if err := rows.Scan(&f.ID, &f.FamilyName, &f.HeadMemberID, &f.HeadName, &f.MemberCount, &f.CreatedAt, &f.UpdatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "database error")
			return
		}
		families = append(families, f)
	}
	httpx.JSON(w, http.StatusOK, families)
}

type familyInput struct {
	FamilyName   string `json:"family_name"`
	HeadMemberID string `json:"head_member_id"`
}

// memberInChurch guards against cross-tenant references via foreign IDs.
func (h *Handler) memberInChurch(memberID, churchID string) bool {
	var n int
	if err := h.DB.QueryRow(`SELECT COUNT(*) FROM members WHERE id = ? AND church_id = ?`, memberID, churchID).Scan(&n); err != nil {
		return false
	}
	return n > 0
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var in familyInput
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	in.FamilyName = strings.TrimSpace(in.FamilyName)
	if in.FamilyName == "" {
		httpx.Error(w, http.StatusBadRequest, "family_name is required")
		return
	}
	churchID := auth.ChurchID(r)
	if in.HeadMemberID != "" && !h.memberInChurch(in.HeadMemberID, churchID) {
		httpx.Error(w, http.StatusBadRequest, "head member not found")
		return
	}
	id, now := db.NewID(), db.Now()
	var head any
	if in.HeadMemberID != "" {
		head = in.HeadMemberID
	}
	if _, err := h.DB.Exec(`INSERT INTO families (id, church_id, family_name, head_member_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		id, churchID, in.FamilyName, head, now, now); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create family")
		return
	}
	h.getDetail(w, r, id)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	h.getDetail(w, r, chi.URLParam(r, "id"))
}

func (h *Handler) getDetail(w http.ResponseWriter, r *http.Request, id string) {
	var f Family
	err := h.DB.QueryRow(`
		SELECT f.id, f.family_name, COALESCE(f.head_member_id,''), COALESCE(m.full_name,''), f.created_at, f.updated_at
		FROM families f LEFT JOIN members m ON m.id = f.head_member_id
		WHERE f.id = ? AND f.church_id = ?`, id, auth.ChurchID(r)).
		Scan(&f.ID, &f.FamilyName, &f.HeadMemberID, &f.HeadName, &f.CreatedAt, &f.UpdatedAt)
	if err == sql.ErrNoRows {
		httpx.Error(w, http.StatusNotFound, "family not found")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}

	rows, err := h.DB.Query(`
		SELECT fm.id, fm.member_id, m.full_name, fm.relation
		FROM family_members fm JOIN members m ON m.id = fm.member_id
		WHERE fm.family_id = ?
		ORDER BY m.full_name COLLATE NOCASE`, id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()
	members := []FamilyMember{}
	for rows.Next() {
		var fm FamilyMember
		if err := rows.Scan(&fm.ID, &fm.MemberID, &fm.FullName, &fm.Relation); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "database error")
			return
		}
		members = append(members, fm)
	}
	f.MemberCount = len(members)
	httpx.JSON(w, http.StatusOK, map[string]any{"family": f, "members": members})
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	id, churchID := chi.URLParam(r, "id"), auth.ChurchID(r)
	var in familyInput
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	in.FamilyName = strings.TrimSpace(in.FamilyName)
	if in.FamilyName == "" {
		httpx.Error(w, http.StatusBadRequest, "family_name is required")
		return
	}
	if in.HeadMemberID != "" && !h.memberInChurch(in.HeadMemberID, churchID) {
		httpx.Error(w, http.StatusBadRequest, "head member not found")
		return
	}
	var head any
	if in.HeadMemberID != "" {
		head = in.HeadMemberID
	}
	res, err := h.DB.Exec(`UPDATE families SET family_name = ?, head_member_id = ?, updated_at = ? WHERE id = ? AND church_id = ?`,
		in.FamilyName, head, db.Now(), id, churchID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not update family")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		httpx.Error(w, http.StatusNotFound, "family not found")
		return
	}
	h.getDetail(w, r, id)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id, churchID := chi.URLParam(r, "id"), auth.ChurchID(r)
	tx, err := h.DB.Begin()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	defer tx.Rollback()
	tx.Exec(`DELETE FROM family_members WHERE family_id = ? AND family_id IN (SELECT id FROM families WHERE church_id = ?)`, id, churchID)
	res, err := tx.Exec(`DELETE FROM families WHERE id = ? AND church_id = ?`, id, churchID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not delete family")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		httpx.Error(w, http.StatusNotFound, "family not found")
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// AddMember adds a member to the family with a relation.
func (h *Handler) AddMember(w http.ResponseWriter, r *http.Request) {
	familyID, churchID := chi.URLParam(r, "id"), auth.ChurchID(r)
	var in struct {
		MemberID string `json:"member_id"`
		Relation string `json:"relation"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !validRelations[in.Relation] {
		httpx.Error(w, http.StatusBadRequest, "relation must be one of: father, mother, child, spouse, sibling, other")
		return
	}
	var n int
	if err := h.DB.QueryRow(`SELECT COUNT(*) FROM families WHERE id = ? AND church_id = ?`, familyID, churchID).Scan(&n); err != nil || n == 0 {
		httpx.Error(w, http.StatusNotFound, "family not found")
		return
	}
	if !h.memberInChurch(in.MemberID, churchID) {
		httpx.Error(w, http.StatusBadRequest, "member not found")
		return
	}
	if err := h.DB.QueryRow(`SELECT COUNT(*) FROM family_members WHERE family_id = ? AND member_id = ?`, familyID, in.MemberID).Scan(&n); err != nil || n > 0 {
		httpx.Error(w, http.StatusConflict, "member is already in this family")
		return
	}
	if _, err := h.DB.Exec(`INSERT INTO family_members (id, family_id, member_id, relation, created_at) VALUES (?, ?, ?, ?, ?)`,
		db.NewID(), familyID, in.MemberID, in.Relation, db.Now()); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not add family member")
		return
	}
	h.getDetail(w, r, familyID)
}

// RemoveMember removes a family_members row.
func (h *Handler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	familyID, fmID := chi.URLParam(r, "id"), chi.URLParam(r, "fmID")
	res, err := h.DB.Exec(`DELETE FROM family_members WHERE id = ? AND family_id = ?
		AND family_id IN (SELECT id FROM families WHERE church_id = ?)`,
		fmID, familyID, auth.ChurchID(r))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not remove family member")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		httpx.Error(w, http.StatusNotFound, "family member not found")
		return
	}
	h.getDetail(w, r, familyID)
}
