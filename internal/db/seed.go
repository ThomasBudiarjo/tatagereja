package db

import (
	"database/sql"
	"fmt"
	"io/fs"
	"sort"
)

// Seed runs every embedded seed file (in filename order) after migrations. Seed
// SQL must be idempotent (upsert), so Seed is safe to run on every boot. It
// returns changed=true when any statement reported affected rows.
func Seed(conn *sql.DB) (changed bool, err error) {
	entries, err := fs.ReadDir(seedsFS, "seeds")
	if err != nil {
		return false, fmt.Errorf("read seeds dir: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		body, readErr := fs.ReadFile(seedsFS, "seeds/"+name)
		if readErr != nil {
			return changed, fmt.Errorf("read seed %s: %w", name, readErr)
		}
		res, execErr := conn.Exec(string(body))
		if execErr != nil {
			return changed, fmt.Errorf("exec seed %s: %w", name, execErr)
		}
		if n, _ := res.RowsAffected(); n > 0 {
			changed = true
		}
	}
	return changed, nil
}
