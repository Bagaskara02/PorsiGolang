package auth

import (
	"time"

	"gorm.io/gorm"
)

type User struct {
	ID                 int         `json:"id" gorm:"primaryKey"`
	Name               string      `json:"name" gorm:"-"`
	Username           string      `json:"username" gorm:"unique;not null"`
	Email              string      `json:"email" gorm:"unique;not null"`
	PasswordHash       string      `json:"-" gorm:"column:password_hash;not null"`
	NamaLengkap        string      `json:"nama_lengkap" gorm:"column:nama_lengkap"`
	Gender             string      `json:"gender" gorm:"not null"`
	Usia               int         `json:"usia" gorm:"not null"`
	BeratBadan         float64     `json:"berat_badan" gorm:"column:berat_badan;not null"`
	TinggiBadan        float64     `json:"tinggi_badan" gorm:"column:tinggi_badan;not null"`
	TingkatAktivitas   string      `json:"tingkat_aktivitas" gorm:"column:tingkat_aktivitas;not null"`
	BMR                float64     `json:"bmr" gorm:"default:0"`
	TargetKaloriHarian float64     `json:"target_kalori_harian" gorm:"column:target_kalori_harian;default:0"`
	CreatedAt          time.Time   `json:"created_at" gorm:"column:created_at"`
}

func (u *User) AfterFind(tx *gorm.DB) (err error) {
	if u.NamaLengkap != "" {
		u.Name = u.NamaLengkap
	} else {
		u.Name = u.Username
	}
	return nil
}

type RegisterRequest struct {
	Username         string  `json:"username" binding:"required,min=3,max=50"`
	Email            string  `json:"email" binding:"required,email,max=254"`
	Password         string  `json:"password" binding:"required,min=8,max=72"`
	NamaLengkap      string  `json:"nama_lengkap" binding:"required,max=100"`
	Gender           string  `json:"gender" binding:"required,oneof=L P"`
	Usia             int     `json:"usia" binding:"required,min=10,max=120"`
	BeratBadan       float64 `json:"berat_badan" binding:"required,gt=0"`
	TinggiBadan      float64 `json:"tinggi_badan" binding:"required,gt=0"`
	TingkatAktivitas string  `json:"tingkat_aktivitas" binding:"required,oneof=sedentary ringan sedang berat"`
}

type credentials struct {
	Username string `json:"username" binding:"required,min=3,max=50"`
	Password string `json:"password" binding:"required,min=8,max=72"`
}
