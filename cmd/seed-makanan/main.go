package main

import (
	"encoding/csv"
	"fmt"
	"log"
	"os"
	"strconv"

	"backend/internal/database"
	"backend/internal/makanan"

	"github.com/joho/godotenv"
	"gorm.io/gorm/clause"
)

func main() {
	if err := godotenv.Load("../../.env"); err != nil {
		godotenv.Load(".env")
	}

	db, err := database.Open(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("Gagal koneksi ke database: %v", err)
	}

	// Buat tabel jika belum ada
	if err := db.AutoMigrate(&makanan.Makanan{}); err != nil {
		log.Fatalf("Gagal migrasi tabel makanan: %v", err)
	}

	csvPath := `D:\Code\Pelatihan Golang\P2\go-programming-blkpp-2026\assignments\meet-05tugas\data\nutrition.csv`
	file, err := os.Open(csvPath)
	if err != nil {
		log.Fatalf("Gagal membuka file CSV: %v", err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	records, err := reader.ReadAll()
	if err != nil {
		log.Fatalf("Gagal membaca CSV: %v", err)
	}

	var listMakanan []makanan.Makanan
	for i, row := range records {
		if i == 0 {
			continue
		}
		id, _ := strconv.ParseUint(row[0], 10, 32)
		cal, _ := strconv.ParseFloat(row[2], 64)
		prot, _ := strconv.ParseFloat(row[3], 64)
		fat, _ := strconv.ParseFloat(row[4], 64)
		carb, _ := strconv.ParseFloat(row[5], 64)

		imgUrl := row[6]
		listMakanan = append(listMakanan, makanan.Makanan{
			ID:           uint(id),
			Name:         row[1],
			Calories:     cal,
			Proteins:     prot,
			Fat:          fat,
			Carbohydrate: carb,
			Image:        &imgUrl,
		})
	}

	result := db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		DoUpdates: clause.AssignmentColumns([]string{"name", "calories", "proteins", "fat", "carbohydrate", "image"}),
	}).Create(&listMakanan)

	if result.Error != nil {
		log.Fatalf("Gagal seeding makanan: %v", result.Error)
	}

	fmt.Printf(" Berhasil memasukkan %d data makanan dari CSV ke database!\n", len(listMakanan))
}