package piring

import (
	"time"

	"backend/internal/auth"
	"backend/internal/makanan"
)

type SesiMakan struct {
	ID        uint        `json:"id" gorm:"primaryKey;column:id"`
	UserID    uint        `json:"user_id" gorm:"column:user_id;index;not null"`
	User      *auth.User  `json:"user,omitempty" gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	CreatedAt time.Time   `json:"created_at" gorm:"column:created_at;type:timestamptz;default:now()"`
	Name      string      `json:"name" gorm:"column:name;type:varchar;not null"`
	MealDate  string      `json:"meal_date" gorm:"column:meal_date;type:date;not null"`
	MealTime  string      `json:"meal_time" gorm:"column:meal_time;type:varchar;not null"`
	Note      *string     `json:"note,omitempty" gorm:"column:note;type:text"`
	IsiPiring []IsiPiring `json:"isi_piring,omitempty" gorm:"foreignKey:SesiMakanID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}

func (SesiMakan) TableName() string {
	return "sesi_makan"
}

type IsiPiring struct {
	ID          uint             `json:"id" gorm:"primaryKey;column:id"`
	SesiMakanID uint             `json:"sesi_makan_id" gorm:"column:sesi_makan_id;not null;index"`
	MakananID   uint             `json:"makanan_id" gorm:"column:makanan_id;not null;index"`
	Makanan     *makanan.Makanan `json:"makanan,omitempty" gorm:"foreignKey:MakananID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;"`
	Gram        float64          `json:"gram" gorm:"column:gram;type:float8;not null"`
	ServingUnit *string          `json:"serving_unit,omitempty" gorm:"column:serving_unit;type:varchar"`
	ServingNote *string          `json:"serving_note,omitempty" gorm:"column:serving_note;type:varchar"`
	CreatedAt   time.Time        `json:"created_at" gorm:"column:created_at;type:timestamptz;default:now()"`
}

func (IsiPiring) TableName() string {
	return "isi_piring"
}

type ItemPiringRequest struct {
	MakananID   uint    `json:"makanan_id" binding:"required"`
	Gram        float64 `json:"gram" binding:"required,gt=0"`
	ServingUnit *string `json:"serving_unit"`
	ServingNote *string `json:"serving_note"`
}

type CreateSesiMakanRequest struct {
	Name      string              `json:"name" binding:"required"`
	MealDate  string              `json:"meal_date" binding:"required"`
	MealTime  string              `json:"meal_time" binding:"required"`
	Note      *string             `json:"note"`
	IsiPiring []ItemPiringRequest `json:"isi_piring" binding:"required,min=1"`
}

type UpdateSesiMakanRequest struct {
	Name      string              `json:"name" binding:"required"`
	MealDate  string              `json:"meal_date" binding:"required"`
	MealTime  string              `json:"meal_time" binding:"required"`
	Note      *string             `json:"note"`
	IsiPiring []ItemPiringRequest `json:"isi_piring" binding:"required,min=1"`
}
