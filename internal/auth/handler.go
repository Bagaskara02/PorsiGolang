package auth

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"gorm.io/gorm"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// formatRegisterValidationError menerjemahkan error validasi menjadi pesan yang ramah pengguna
func formatRegisterValidationError(err error) string {
	var ve validator.ValidationErrors
	if errors.As(err, &ve) {
		for _, fe := range ve {
			field := fe.Field()
			tag := fe.Tag()
			param := fe.Param()

			switch field {
			case "Username":
				switch tag {
				case "required":
					return "Username wajib diisi."
				case "min":
					return fmt.Sprintf("Username minimal %s karakter.", param)
				case "max":
					return fmt.Sprintf("Username maksimal %s karakter.", param)
				default:
					return "Format username tidak valid."
				}
			case "Email":
				switch tag {
				case "required":
					return "Email wajib diisi."
				case "email":
					return "Format email tidak valid (contoh: nama@email.com)."
				default:
					return "Format email tidak valid."
				}
			case "Password":
				switch tag {
				case "required":
					return "Password wajib diisi."
				case "min":
					return fmt.Sprintf("Password minimal %s karakter.", param)
				case "max":
					return fmt.Sprintf("Password maksimal %s karakter.", param)
				default:
					return "Password tidak memenuhi syarat keamanan."
				}
			case "NamaLengkap":
				return "Nama lengkap wajib diisi."
			case "Gender":
				return "Pilih jenis kelamin: L (Laki-laki) atau P (Perempuan)."
			case "Usia":
				return "Usia harus antara 10 hingga 120 tahun."
			case "BeratBadan":
				return "Berat badan harus lebih dari 0 kg."
			case "TinggiBadan":
				return "Tinggi badan harus lebih dari 0 cm."
			case "TingkatAktivitas":
				return "Pilih tingkat aktivitas fisik yang sesuai."
			default:
				return fmt.Sprintf("Data %s tidak valid.", strings.ToLower(field))
			}
		}
	}
	return "Format data registrasi tidak valid. Silakan periksa kembali."
}

// formatLoginValidationError menerjemahkan error validasi login
func formatLoginValidationError(err error) string {
	var ve validator.ValidationErrors
	if errors.As(err, &ve) {
		for _, fe := range ve {
			switch fe.Field() {
			case "Username":
				if fe.Tag() == "min" {
					return "Username minimal 3 karakter."
				}
				return "Username wajib diisi."
			case "Password":
				if fe.Tag() == "min" {
					return "Password minimal 8 karakter."
				}
				return "Password wajib diisi."
			}
		}
	}
	return "Username atau format password tidak valid."
}

func (h *Handler) Register(c *gin.Context) {
	var input RegisterRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": formatRegisterValidationError(err)})
		return
	}
	user, err := h.service.Register(c.Request.Context(), input)
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		c.JSON(http.StatusConflict, gin.H{"error": "Username atau Email sudah terdaftar."})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal mendaftarkan akun. Silakan coba lagi."})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": formatLoginValidationError(err)})
		return
	}

	token, err := h.service.Login(c.Request.Context(), input.Username, input.Password)
	if errors.Is(err, ErrInvalidCredentials) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Username atau password salah."})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memproses login. Silakan coba lagi."})
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
	isSecure := c.Request.TLS != nil || c.Request.Header.Get("X-Forwarded-Proto") == "https"
	c.SetCookie("access_token", token, maxAge, "/", "", isSecure, true)
}

func (h *Handler) Logout(c *gin.Context) {
	setAuthCookie(c, "", -1)
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"message": "Sudah keluar"}})
}
