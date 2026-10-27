package piring

import (
	"backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(group *gin.RouterGroup, h *Handler) {
	piringGroup := group.Group("/piring")
	{
		piringGroup.POST("", middleware.MockEndpoint("private.piring.create"), h.Create)
		piringGroup.GET("", middleware.MockEndpoint("private.piring.list"), h.List)
		piringGroup.GET("/:id", middleware.MockEndpoint("private.piring.get"), h.GetByID)
		piringGroup.PUT("/:id", middleware.MockEndpoint("private.piring.update"), h.Update)
		piringGroup.DELETE("/:id", middleware.MockEndpoint("private.piring.delete"), h.Delete)
	}
}
