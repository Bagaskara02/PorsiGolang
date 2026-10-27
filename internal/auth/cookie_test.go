package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestAuthCookie(t *testing.T) {
	for _, scheme := range []string{"http", "https"} {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", scheme+"://localhost/api/auth/login", nil)
		setAuthCookie(c, "test-token", 3600)
		cookie := w.Result().Cookies()[0]
		if cookie.Name != "access_token" || cookie.Value != "test-token" || !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode || cookie.Path != "/" || cookie.MaxAge != 3600 || cookie.Secure != (scheme == "https") {
			t.Fatalf("Cookie salah: %+v", cookie)
		}
	}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/auth/logout", nil)
	(&Handler{}).Logout(c)
	cookie := w.Result().Cookies()[0]
	if w.Code != http.StatusOK || cookie.Name != "access_token" || cookie.MaxAge != -1 || cookie.Path != "/" || !cookie.HttpOnly {
		t.Fatalf("Logout gagal menghapus cookie: %+v", cookie)
	}
}
