package reminder

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/smtp"
	"sync"
	"time"
)

type EtherealAccount struct {
	User string `json:"user"`
	Pass string `json:"pass"`
	SMTP struct {
		Host   string `json:"host"`
		Port   int    `json:"port"`
		Secure bool   `json:"secure"`
	} `json:"smtp"`
	Web string `json:"web"`
}

type Service struct {
	mu      sync.Mutex
	account *EtherealAccount
	client  *http.Client
}

func NewService() *Service {
	return &Service{
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

// getAccount menginisialisasi atau menggunakan akun Ethereal secara otomatis tanpa perlu .env
func (s *Service) getAccount() (*EtherealAccount, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.account != nil {
		return s.account, nil
	}

	payload, _ := json.Marshal(map[string]string{
		"requestor": "PorsiApp",
		"version":   "1.0.0",
	})

	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, "https://api.nodemailer.com/user", bytes.NewBuffer(payload))
	if err != nil {
		return s.fallbackAccount(), nil
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		return s.fallbackAccount(), nil
	}
	defer resp.Body.Close()

	var acc EtherealAccount
	if err := json.NewDecoder(resp.Body).Decode(&acc); err != nil || acc.User == "" {
		return s.fallbackAccount(), nil
	}

	s.account = &acc
	return s.account, nil
}

func (s *Service) fallbackAccount() *EtherealAccount {
	return &EtherealAccount{
		User: "osmgfzs6fwq4o5li@ethereal.email",
		Pass: "8beuvCBj2HZPYKpf5t",
		SMTP: struct {
			Host   string `json:"host"`
			Port   int    `json:"port"`
			Secure bool   `json:"secure"`
		}{
			Host:   "smtp.ethereal.email",
			Port:   587,
			Secure: false,
		},
		Web: "https://ethereal.email",
	}
}

// SendCalorieReminder mengirim email pengingat kalori harian via Ethereal SMTP
func (s *Service) SendCalorieReminder(toEmail, toName string, consumed, target int) (map[string]interface{}, error) {
	acc, err := s.getAccount()
	if err != nil {
		return nil, fmt.Errorf("gagal mendapatkan akun pengirim: %w", err)
	}

	deficit := target - consumed
	if deficit < 0 {
		deficit = 0
	}
	pct := 0
	if target > 0 {
		pct = (consumed * 100) / target
		if pct > 100 {
			pct = 100
		}
	}

	if toName == "" {
		toName = "Sahabat Porsi"
	}

	subject := fmt.Sprintf("Subject: [Porsi] Pengingat Kalori Harian: Masih Kurang %d kkal!\r\n", deficit)
	from := fmt.Sprintf("From: Porsi Nutrisi <%s>\r\n", acc.User)
	to := fmt.Sprintf("To: %s <%s>\r\n", toName, toEmail)
	mime := "MIME-version: 1.0;\r\nContent-Type: text/html; charset=\"UTF-8\";\r\n\r\n"

	body := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAF6; margin: 0; padding: 24px; color: #1F2937; }
    .card { max-width: 540px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; border: 1px solid #E5E9E0; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.04); }
    .header { background: #55734B; padding: 24px 32px; text-align: center; color: #FFFFFF; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
    .content { padding: 32px; }
    .greeting { font-size: 17px; font-weight: 700; color: #111827; margin-bottom: 12px; }
    .highlight-box { background: #F4F7F1; border: 1px solid #DCE4D6; border-radius: 12px; padding: 18px; margin: 20px 0; text-align: center; }
    .highlight-num { font-size: 32px; font-weight: 800; color: #55734B; }
    .highlight-lbl { font-size: 13px; color: #6B7280; font-weight: 500; margin-top: 4px; }
    .progress-bar-bg { background: #E5E9E0; border-radius: 99px; height: 10px; overflow: hidden; margin: 16px 0 8px 0; }
    .progress-bar-fill { background: #55734B; height: 100%%; width: %d%%; }
    .footer { text-align: center; font-size: 12px; color: #9CA3AF; padding: 20px 32px; border-top: 1px solid #F3F4F6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>porsi<span style="color: #A3E635;">.</span></h1>
      <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">Pengingat Asupan Energi & Gizi Harian</p>
    </div>
    <div class="content">
      <div class="greeting">Halo, %s! 👋</div>
      <p style="line-height: 1.6; font-size: 14.5px; color: #374151;">
        Berdasarkan catatan piring makanmu hari ini, asupan kalorimu <strong>belum memenuhi target harian</strong> yang telah kamu tetapkan.
      </p>

      <div class="highlight-box">
        <div class="highlight-num">%d kkal</div>
        <div class="highlight-lbl">Sisa kalori yang perlu dipenuhi hari ini</div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill"></div>
        </div>
        <div style="font-size: 12px; color: #4B5563; font-weight: 600;">%d kkal tercapai dari target %d kkal (%d%%)</div>
      </div>

      <p style="line-height: 1.5; font-size: 13.5px; color: #6B7280;">
        💡 <em>Tips Sehat:</em> Kamu bisa menambahkan camilan sehat kaya protein atau makanan bernutrisi seimbang untuk memenuhi defisit energimu sebelum hari berakhir.
      </p>
    </div>
    <div class="footer">
      Email ini dikirim otomatis oleh sistem Porsi. • Demo Ethereal Email Testing
    </div>
  </div>
</body>
</html>`, pct, toName, deficit, consumed, target, pct)

	msg := []byte(subject + from + to + mime + body)

	addr := fmt.Sprintf("%s:%d", acc.SMTP.Host, acc.SMTP.Port)
	auth := smtp.PlainAuth("", acc.User, acc.Pass, acc.SMTP.Host)

	// Kirim email via SMTP Ethereal
	if err := smtp.SendMail(addr, auth, acc.User, []string{toEmail}, msg); err != nil {
		return nil, fmt.Errorf("smtp send error: %w", err)
	}

	result := map[string]interface{}{
		"to":          toEmail,
		"consumed":    consumed,
		"target":      target,
		"deficit":     deficit,
		"sender_user": acc.User,
		"sender_pass": acc.Pass,
		"preview_url": fmt.Sprintf("https://ethereal.email/messages"),
	}

	return result, nil
}
