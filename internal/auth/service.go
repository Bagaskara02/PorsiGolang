package auth

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	ErrInvalidCredentials = errors.New("email atau password salah")
	ErrInvalidToken       = errors.New("token tidak valid atau kedaluwarsa")
)

type Service struct {
	repo   *Repository
	secret []byte
}

func NewService(repo *Repository, secret []byte) *Service {
	return &Service{repo: repo, secret: secret}
}

func CalculateBMR(gender string, berat, tinggi float64, usia int) float64 {
	base := (10 * berat) + (6.25 * tinggi) - float64(5*usia)
	if strings.ToUpper(gender) == "L" {
		return base + 5
	}
	return base - 161
}

func CalculateTDEE(bmr float64, aktivitas string) float64 {
	var multiplier float64
	switch strings.ToLower(aktivitas) {
	case "sedentary":
		multiplier = 1.2
	case "ringan":
		multiplier = 1.375
	case "sedang":
		multiplier = 1.55
	case "berat":
		multiplier = 1.725
	default:
		multiplier = 1.2
	}
	return bmr * multiplier
}

func (s *Service) Register(ctx context.Context, req RegisterRequest) (User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return User{}, err
	}
	bmr := CalculateBMR(req.Gender, req.BeratBadan, req.TinggiBadan, req.Usia)
	targetKalori := CalculateTDEE(bmr, req.TingkatAktivitas)
	user := User{
		Username:           strings.TrimSpace(req.Username),
		Email:              strings.ToLower(strings.TrimSpace(req.Email)),
		PasswordHash:       string(hash),
		NamaLengkap:        strings.TrimSpace(req.NamaLengkap),
		Name:               strings.TrimSpace(req.NamaLengkap),
		Gender:             strings.ToUpper(req.Gender),
		Usia:               req.Usia,
		BeratBadan:         req.BeratBadan,
		TinggiBadan:        req.TinggiBadan,
		TingkatAktivitas:   strings.ToLower(req.TingkatAktivitas),
		BMR:                bmr,
		TargetKaloriHarian: targetKalori,
	}
	if err := s.repo.Create(ctx, &user); err != nil {
		return User{}, err
	}
	return user, nil
}

func (s *Service) Login(ctx context.Context, username, password string) (string, error) {
	user, err := s.repo.GetByUsername(ctx, strings.TrimSpace(username))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", ErrInvalidCredentials
	}
	if err != nil {
		return "", err
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)) != nil {
		return "", ErrInvalidCredentials
	}
	now := time.Now()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.RegisteredClaims{
		Issuer:    "gin-auth",
		Subject:   strconv.FormatUint(uint64(user.ID), 10),
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour * 24)),
	})
	return token.SignedString(s.secret)
}

func (s *Service) Authenticate(ctx context.Context, rawToken string) (User, error) {
	claims := &jwt.RegisteredClaims{}
	_, err := jwt.ParseWithClaims(rawToken, claims, func(token *jwt.Token) (any, error) {
		return s.secret, nil
	}, jwt.WithValidMethods([]string{"HS256"}), jwt.WithExpirationRequired(), jwt.WithIssuer("gin-auth"))
	if err != nil {
		return User{}, ErrInvalidToken
	}
	id, err := strconv.ParseUint(claims.Subject, 10, strconv.IntSize)
	if err != nil || id == 0 {
		return User{}, ErrInvalidToken
	}
	user, err := s.repo.GetByID(ctx, uint(id))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return User{}, ErrInvalidToken
	}
	return user, err
}
