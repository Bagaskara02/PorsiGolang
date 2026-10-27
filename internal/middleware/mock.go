package middleware

import "github.com/gin-gonic/gin"

// MockEndpoint menyediakan hook berbeda untuk setiap endpoint.
// ponytail: hook hanya memberi header; tambah aturan endpoint saat kebutuhan sudah jelas.
func MockEndpoint(name string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Mock-Middleware", name)
		// Tambahkan logika sebelum handler di sini.
		c.Next()
		// Tambahkan logika setelah handler di sini.
	}
}
