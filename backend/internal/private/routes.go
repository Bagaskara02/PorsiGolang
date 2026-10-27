package private

import (
	"net/http"

	"backend/internal/middleware"
	"backend/internal/piring"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(r *gin.Engine, requireAuth gin.HandlerFunc, piringHandler *piring.Handler) {
	group := r.Group("/api/private")
	group.Use(requireAuth)

	piring.RegisterRoutes(group, piringHandler)

	group.GET("/profile", middleware.MockEndpoint("private.profile"), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"data": c.MustGet("user")})
	})
}