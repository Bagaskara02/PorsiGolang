package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestAuthenticateRejectsInvalidTokens(t *testing.T) {
	secret := []byte("test-secret-with-at-least-32-bytes")
	service := NewService(NewRepository(nil), secret)
	for _, name := range []string{"expired", "no expiry", "wrong issuer", "invalid subject", "wrong signature", "wrong algorithm"} {
		t.Run(name, func(t *testing.T) {
			claims := jwt.RegisteredClaims{
				Issuer: "gin-auth", Subject: "1", ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			}
			key := secret
			var method jwt.SigningMethod = jwt.SigningMethodHS256
			switch name {
			case "expired":
				claims.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Hour))
			case "no expiry":
				claims.ExpiresAt = nil
			case "wrong issuer":
				claims.Issuer = "other-app"
			case "invalid subject":
				claims.Subject = "-1"
			case "wrong signature":
				key = []byte("other-secret-with-at-least-32-bytes")
			case "wrong algorithm":
				method = jwt.SigningMethodHS384
			}
			token, err := jwt.NewWithClaims(method, claims).SignedString(key)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := service.Authenticate(context.Background(), token); !errors.Is(err, ErrInvalidToken) {
				t.Fatalf("Token harus ditolak sebelum akses database: %v", err)
			}
		})
	}
}
