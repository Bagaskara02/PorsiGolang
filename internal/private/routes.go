package private

import (
	"net/http"

	"backend/internal/middleware"
	"backend/internal/piring"
	"backend/internal/reminder"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(r *gin.Engine, requireAuth gin.HandlerFunc, piringHandler *piring.Handler, reminderHandler *reminder.Handler) {
	group := r.Group("/api/private")
	group.Use(requireAuth)

	piring.RegisterRoutes(group, piringHandler)

	// Endpoint Pengingat Kalori Harian (Ethereal Email)
	if reminderHandler != nil {
		group.POST("/reminder/send", reminderHandler.CheckAndSendReminder)
		group.GET("/reminder/send", reminderHandler.CheckAndSendReminder)
	}

	group.GET("/profile", middleware.MockEndpoint("private.profile"), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"data": c.MustGet("user")})
	})
}
