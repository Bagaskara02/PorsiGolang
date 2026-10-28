package main

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"backend/internal/auth"
	"backend/internal/database"
	"backend/internal/makanan"
	"backend/internal/middleware"
	"backend/internal/piring"
	"backend/internal/private"
	"backend/internal/public"
	"backend/internal/reminder"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"gorm.io/gorm"
)

func setupEngine(db *gorm.DB, secret []byte) *gin.Engine {
	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			return true
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	r.Use(func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1<<20)
		c.Next()
	})

	r.GET("/health", middleware.MockEndpoint("health"), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"status": "ok"}})
	})

	// 1. Modul Auth
	authRepo := auth.NewRepository(db)
	authService := auth.NewService(authRepo, secret)
	authHandler := auth.NewHandler(authService)
	auth.RegisterRoutes(r, authHandler)

	// 2. Modul Makanan (Katalog Publik)
	makananRepo := makanan.NewRepository(db)
	makananService := makanan.NewService(makananRepo)
	makananHandler := makanan.NewHandler(makananService)
	public.RegisterRoutes(r, makananHandler)

	// 3. Modul Piring (Sesi Makan & Isi Piring - Privat)
	piringRepo := piring.NewRepository(db)
	piringService := piring.NewService(piringRepo)
	piringHandler := piring.NewHandler(piringService)

	// 4. Modul Notifikasi Pengingat Kalori Harian (Ethereal Email)
	reminderService := reminder.NewService()
	reminderHandler := reminder.NewHandler(reminderService, piringService)
	private.RegisterRoutes(r, authHandler.RequireAuth(), piringHandler, reminderHandler)

	// 4. Layani File Statis Frontend (Client)
	clientDir := "./client"
	if _, err := os.Stat(clientDir); os.IsNotExist(err) {
		clientDir = "../client"
	}
	if _, err := os.Stat(clientDir); err == nil {
		r.Static("/css", filepath.Join(clientDir, "css"))
		r.Static("/js", filepath.Join(clientDir, "js"))
		r.Static("/views", filepath.Join(clientDir, "views"))
		r.StaticFile("/", filepath.Join(clientDir, "index.html"))
		r.StaticFile("/index.html", filepath.Join(clientDir, "index.html"))

		r.NoRoute(func(c *gin.Context) {
			if strings.HasPrefix(c.Request.URL.Path, "/api") {
				c.JSON(http.StatusNotFound, gin.H{"error": "Endpoint tidak ditemukan"})
				return
			}
			c.File(filepath.Join(clientDir, "index.html"))
		})
	}

	return r
}

func run() error {
	if err := godotenv.Load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("load .env: %w", err)
	}

	secret := []byte(os.Getenv("JWT_SECRET"))
	if len(secret) < 32 {
		return fmt.Errorf("JWT_SECRET wajib diisi minimal 32 byte")
	}

	db, err := database.Open(os.Getenv("DATABASE_URL"))
	if err != nil {
		return fmt.Errorf("buka database: %w", err)
	}

	conn, err := db.DB()
	if err != nil {
		return err
	}
	defer conn.Close()

	// AutoMigrate ke-4 tabel sesuai ERD
	if err := db.AutoMigrate(
		&auth.User{},
		&makanan.Makanan{},
		&piring.SesiMakan{},
		&piring.IsiPiring{},
	); err != nil {
		return fmt.Errorf("migrasi tabel gagal: %w", err)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           setupEngine(db, secret),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	log.Printf("Server berjalan di http://localhost:%s", port)
	return server.ListenAndServe()
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
