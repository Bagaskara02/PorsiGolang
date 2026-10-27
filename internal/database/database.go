package database

import (
	"context"
	"errors"
	"net/url"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Open(dsn string) (*gorm.DB, error) {
	u, err := url.Parse(dsn)
	if err != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") || u.Hostname() == "" || u.User == nil || len(u.Path) < 2 {
		return nil, errors.New("DATABASE_URL wajib berupa connection string PostgreSQL Neon yang valid")
	}
	query := u.Query()
	switch query.Get("sslmode") {
	case "require", "verify-ca", "verify-full":
	default:
		return nil, errors.New("DATABASE_URL wajib memakai TLS: sslmode=require atau verify-full")
	}
	if query.Get("connect_timeout") == "" {
		query.Set("connect_timeout", "10")
	}
	u.RawQuery = query.Encode()
	db, err := gorm.Open(postgres.New(postgres.Config{
		DSN: u.String(), PreferSimpleProtocol: true,
	}), &gorm.Config{
		TranslateError: true, DisableAutomaticPing: true,
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		// Error parser DSN dapat memuat kredensial; jangan teruskan ke log.
		return nil, errors.New("konfigurasi koneksi PostgreSQL tidak valid")
	}
	conn, err := db.DB()
	if err != nil {
		return nil, err
	}
	conn.SetMaxOpenConns(10)
	conn.SetMaxIdleConns(5)
	conn.SetConnMaxLifetime(30 * time.Minute)
	conn.SetConnMaxIdleTime(5 * time.Minute)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := conn.PingContext(ctx); err != nil {
		conn.Close()
		return nil, errors.New("koneksi PostgreSQL gagal; periksa DATABASE_URL dan akses jaringan Neon")
	}
	return db, nil
}
