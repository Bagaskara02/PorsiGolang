package reminder

import (
	"math"
	"net/http"
	"time"

	"backend/internal/auth"
	"backend/internal/piring"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	reminderService *Service
	piringService   *piring.Service
}

func NewHandler(reminderService *Service, piringService *piring.Service) *Handler {
	return &Handler{
		reminderService: reminderService,
		piringService:   piringService,
	}
}

// CheckAndSendReminder memeriksa apakah kalori harian sudah tercapai, jika belum otomatis kirim email ke user
func (h *Handler) CheckAndSendReminder(c *gin.Context) {
	uVal, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Pengguna tidak terautentikasi"})
		return
	}
	user, ok := uVal.(auth.User)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Data pengguna tidak valid"})
		return
	}

	today := time.Now().Format("2006-01-02")
	meals, err := h.piringService.List(c.Request.Context(), uint(user.ID), today)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menghitung kalori hari ini"})
		return
	}

	var consumedCal float64
	for _, m := range meals {
		for _, it := range m.IsiPiring {
			if it.Makanan != nil {
				ratio := it.Gram / 100.0
				consumedCal += it.Makanan.Calories * ratio
			}
		}
	}

	consumedInt := int(math.Round(consumedCal))
	targetInt := int(math.Round(user.TargetKaloriHarian))
	if targetInt <= 0 {
		targetInt = 2000
	}

	// Periksa apakah kalori sudah memenuhi target
	if consumedInt >= targetInt {
		c.JSON(http.StatusOK, gin.H{
			"status":   "achieved",
			"message":  "Target kalori hari ini sudah terpenuhi, tidak perlu pengingat.",
			"consumed": consumedInt,
			"target":   targetInt,
		})
		return
	}

	// Kirim email pengingat via Ethereal ke email pendaftaran pengguna di awal
	res, err := h.reminderService.SendCalorieReminder(user.Email, user.NamaLengkap, consumedInt, targetInt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Gagal mengirim email pengingat: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "sent",
		"message": "Pengingat kalori berhasil dikirim ke " + user.Email,
		"data":    res,
	})
}
