package makanan

import (
	"backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterPublicRoutes(group *gin.RouterGroup, h *Handler) {
	makananGroup := group.Group("/makanan")
	{
		makananGroup.GET("", middleware.MockEndpoint("public.makanan.list"), h.List)
		makananGroup.GET("/:id", middleware.MockEndpoint("public.makanan.get"), h.GetByID)
	}
}