package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"

	"backend/internal/database"
	"backend/internal/makanan"

	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load("../../.env"); err != nil {
		godotenv.Load(".env")
	}

	db, err := database.Open(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("Gagal koneksi ke database: %v", err)
	}

	var list []makanan.Makanan
	if err := db.Order("id asc").Find(&list).Error; err != nil {
		log.Fatalf("Gagal query makanan: %v", err)
	}

	out, _ := json.MarshalIndent(list, "", "  ")
	fmt.Println(string(out))
}
