package piring

import (
	"errors"
	"net/http"
	"strconv"

	"backend/internal/auth"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) Create(c *gin.Context) {
	var input CreateSesiMakanRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Format data tidak valid: " + err.Error()})
		return
	}

	user := c.MustGet("user").(auth.User)
	sesi, err := h.service.Create(c.Request.Context(), input, uint(user.ID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan sesi makan"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Sesi makan berhasil dicatat",
		"data":    sesi,
	})
}

func (h *Handler) List(c *gin.Context) {
	user := c.MustGet("user").(auth.User)
	date := c.Query("date")

	list, err := h.service.List(c.Request.Context(), uint(user.ID), date)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membaca sesi makan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": list})
}

func (h *Handler) GetByID(c *gin.Context) {
	user := c.MustGet("user").(auth.User)
	id, err := strconv.ParseUint(c.Param("id"), 10, strconv.IntSize)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID tidak valid"})
		return
	}

	sesi, err := h.service.GetByID(c.Request.Context(), uint(id), uint(user.ID))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Sesi makan tidak ditemukan"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membaca data"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": sesi})
}

func (h *Handler) Update(c *gin.Context) {
	user := c.MustGet("user").(auth.User)
	id, err := strconv.ParseUint(c.Param("id"), 10, strconv.IntSize)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID tidak valid"})
		return
	}

	var input UpdateSesiMakanRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Format data tidak valid: " + err.Error()})
		return
	}

	sesi, err := h.service.Update(c.Request.Context(), uint(id), input, uint(user.ID))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Sesi makan tidak ditemukan"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memperbarui sesi makan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Sesi makan berhasil diperbarui",
		"data":    sesi,
	})
}

func (h *Handler) Delete(c *gin.Context) {
	user := c.MustGet("user").(auth.User)
	id, err := strconv.ParseUint(c.Param("id"), 10, strconv.IntSize)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID tidak valid"})
		return
	}

	if err := h.service.Delete(c.Request.Context(), uint(id), uint(user.ID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menghapus sesi makan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Sesi makan berhasil dihapus"})
}
