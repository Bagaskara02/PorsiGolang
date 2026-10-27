package auth

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		unauthorized := func() {
			c.Header("WWW-Authenticate", "Bearer")
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Token tidak valid atau kedaluwarsa"})
		}
		token, _ := c.Cookie("access_token")
		if header := c.GetHeader("Authorization"); header != "" {
			parts := strings.Fields(header)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
				unauthorized()
				return
			}
			token = parts[1]
		}
		if token == "" {
			unauthorized()
			return
		}
		user, err := h.service.Authenticate(c.Request.Context(), token)
		if errors.Is(err, ErrInvalidToken) {
			unauthorized()
			return
		}
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "Gagal membaca pengguna"})
			return
		}
		c.Set("user", user)
		c.Next()
	}
}
