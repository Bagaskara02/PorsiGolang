package main

import (
	"errors"
	"flag"
	"fmt"
	"log"
	"os"

	"backend/internal/database"

	"github.com/joho/godotenv"
)

func run(args ...interface{}) error {
	tableName := "categories"
	confirm := false

	switch len(args) {
	case 1:
		switch v := args[0].(type) {
		case bool:
			confirm = v
		case string:
			tableName = v
		default:
			return errors.New("argumen run tidak valid")
		}
	case 2:
		name, ok := args[0].(string)
		if !ok {
			return errors.New("nama tabel harus berupa string")
		}
		tableName = name
		flagConfirm, ok := args[1].(bool)
		if !ok {
			return errors.New("konfirmasi harus berupa bool")
		}
		confirm = flagConfirm
	default:
		return errors.New("run membutuhkan 1 atau 2 argumen")
	}

	if !confirm {
		return errors.New("penghapusan dibatalkan; gunakan -confirm untuk menghapus tabel " + tableName + " beserta seluruh datanya")
	}
	if err := godotenv.Load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("load .env: %w", err)
	}
	db, err := database.Open(os.Getenv("DATABASE_URL"))
	if err != nil {
		return err
	}
	conn, err := db.DB()
	if err != nil {
		return err
	}
	defer conn.Close()

	// Driver PostgreSQL GORM memakai CASCADE: dependency seperti foreign key ikut dihapus.
	if err := db.Migrator().DropTable(tableName); err != nil {
		return fmt.Errorf("hapus tabel %s gagal: %w", tableName, err)
	}
	log.Printf("Tabel %s sudah tidak ada", tableName)
	return nil
}

func main() {
	tableName := flag.String("table", "", "nama tabel yang akan dihapus")
	confirm := flag.Bool("confirm", false, "hapus tabel beserta seluruh data dan dependency (CASCADE)")
	flag.Parse()
	if *tableName == "" {
		log.Fatal("nama tabel wajib diisi")
	}
	if err := run(*tableName, *confirm); err != nil {
		log.Fatal(err)
	}
}
