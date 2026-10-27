package auth

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) Register(c *gin.Context) {
	var input RegisterRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Format data tidak valid: " + err.Error()})
		return
	}
	user, err := h.service.Register(c.Request.Context(), input)
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		c.JSON(http.StatusConflict, gin.H{"error": "Username atau Email sudah terdaftar"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal mendaftarkan pengguna"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"message": "Registrasi berhasil",
		"data":    user,
	})
}

func (h *Handler) Login(c *gin.Context) {
	var input credentials
	if err := c.ShouldBindJSON(&input); err != nil || len(input.Password) > 72 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Username atau format password tidak valid"})
		return
	}

	token, err := h.service.Login(c.Request.Context(), input.Username, input.Password)
	if errors.Is(err, ErrInvalidCredentials) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Username atau password salah"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memproses login"})
		return
	}

	setAuthCookie(c, token, 3600*24)
	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"access_token": token,
		"token_type":   "Bearer",
		"expires_in":   86400,
	}})
}

func (h *Handler) Me(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"data": c.MustGet("user")})
}

func setAuthCookie(c *gin.Context, token string, maxAge int) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("access_token", token, maxAge, "/", "", c.Request.TLS != nil, true)
}

func (h *Handler) Logout(c *gin.Context) {
	setAuthCookie(c, "", -1)
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"message": "Sudah keluar"}})
}
