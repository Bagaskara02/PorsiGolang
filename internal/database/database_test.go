package database

import "testing"

func TestRejectInvalidDatabaseURL(t *testing.T) {
	for _, dsn := range []string{
		"", "gin-auth.db", "%", "https://example.com/db",
		"postgresql://user:secret@localhost/db",
		"postgresql://user:secret@localhost/db?sslmode=disable",
		"postgresql://user:secret@localhost/db?sslmode=prefer",
		"postgresql://user:secret@/db?sslmode=require",
	} {
		if _, err := Open(dsn); err == nil {
			t.Fatal("URL tidak valid atau tanpa TLS harus ditolak")
		}
	}
}
