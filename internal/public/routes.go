package public

import (
	"backend/internal/makanan"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(r *gin.Engine, makananHandler *makanan.Handler) {
	group := r.Group("/api/public")
	makanan.RegisterPublicRoutes(group, makananHandler)
}