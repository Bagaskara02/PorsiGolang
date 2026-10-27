package main

import "testing"

func TestRunRequiresConfirmation(t *testing.T) {
	// Tanpa konfirmasi, berhenti sebelum membuka koneksi database.
	t.Setenv("DATABASE_URL", "invalid")
	want := "penghapusan dibatalkan; gunakan -confirm untuk menghapus tabel categories beserta seluruh datanya"
	if err := run(false); err == nil || err.Error() != want {
		t.Fatalf("run(false) = %v; want %q", err, want)
	}
}
