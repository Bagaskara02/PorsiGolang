package auth

import (
	"backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(r *gin.Engine, h *Handler) {
	group := r.Group("/api/auth")
	group.POST("/register", middleware.MockEndpoint("auth.register"), h.Register)
	group.POST("/login", middleware.MockEndpoint("auth.login"), h.Login)
	group.POST("/logout", h.Logout)
	r.GET("/api/me", middleware.MockEndpoint("auth.me"), h.RequireAuth(), h.Me)
}
