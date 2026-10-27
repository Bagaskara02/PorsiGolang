package piring

import (
	"context"

	"gorm.io/gorm"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(ctx context.Context, sesi *SesiMakan) error {
	return r.db.WithContext(ctx).Create(sesi).Error
}

func (r *Repository) ListByUserID(ctx context.Context, userID uint, date string) ([]SesiMakan, error) {
	var list []SesiMakan
	query := r.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Preload("User").
		Preload("IsiPiring.Makanan").
		Order("meal_date DESC, meal_time ASC")

	if date != "" {
		query = query.Where("meal_date = ?", date)
	}

	err := query.Find(&list).Error
	return list, err
}

func (r *Repository) GetByID(ctx context.Context, id uint, userID uint) (SesiMakan, error) {
	var sesi SesiMakan
	err := r.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", id, userID).
		Preload("User").
		Preload("IsiPiring.Makanan").
		First(&sesi).Error
	return sesi, err
}

func (r *Repository) FindByDateTimeAndName(ctx context.Context, userID uint, date string, time string, name string) (*SesiMakan, error) {
	var sesi SesiMakan
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND meal_date = ? AND meal_time = ? AND name = ?", userID, date, time, name).
		Preload("User").
		Preload("IsiPiring.Makanan").
		Order("id ASC").
		First(&sesi).Error
	if err != nil {
		return nil, err
	}
	return &sesi, nil
}

func (r *Repository) ConsolidateDuplicates(ctx context.Context, userID uint) error {
	type DupGroup struct {
		MealDate string `gorm:"column:meal_date"`
		MealTime string `gorm:"column:meal_time"`
		Name     string `gorm:"column:name"`
		Total    int    `gorm:"column:total"`
	}

	var dups []DupGroup
	err := r.db.WithContext(ctx).
		Model(&SesiMakan{}).
		Select("meal_date, meal_time, name, count(*) as total").
		Where("user_id = ?", userID).
		Group("meal_date, meal_time, name").
		Having("count(*) > 1").
		Scan(&dups).Error
	if err != nil || len(dups) == 0 {
		return err
	}

	for _, d := range dups {
		var sessions []SesiMakan
		if err := r.db.WithContext(ctx).
			Where("user_id = ? AND meal_date = ? AND meal_time = ? AND name = ?", userID, d.MealDate, d.MealTime, d.Name).
			Order("id ASC").
			Preload("IsiPiring").
			Find(&sessions).Error; err != nil || len(sessions) <= 1 {
			continue
		}

		primary := sessions[0]
		existingFoods := make(map[uint]uint)
		for _, it := range primary.IsiPiring {
			existingFoods[it.MakananID] = it.ID
		}

		var idsToDelete []uint
		_ = r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			for i := 1; i < len(sessions); i++ {
				sec := sessions[i]
				idsToDelete = append(idsToDelete, sec.ID)
				for _, it := range sec.IsiPiring {
					if targetID, ok := existingFoods[it.MakananID]; ok {
						// Akumulasi gramasi jika jenis makanannya persis sama
						tx.Model(&IsiPiring{}).Where("id = ?", targetID).Update("gram", gorm.Expr("gram + ?", it.Gram))
					} else {
						// Pindahkan butir makanan baru ke sesi utama
						newItem := IsiPiring{
							SesiMakanID: primary.ID,
							MakananID:   it.MakananID,
							Gram:        it.Gram,
							ServingUnit: it.ServingUnit,
							ServingNote: it.ServingNote,
						}
						tx.Create(&newItem)
						existingFoods[it.MakananID] = newItem.ID
					}
				}
			}

			if len(idsToDelete) > 0 {
				tx.Where("sesi_makan_id IN ?", idsToDelete).Delete(&IsiPiring{})
				tx.Where("id IN ?", idsToDelete).Delete(&SesiMakan{})
			}
			return nil
		})
	}
	return nil
}

func (r *Repository) Update(ctx context.Context, sesi *SesiMakan, items []IsiPiring) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 1. Perbarui atribut sesi makan
		if err := tx.Model(&SesiMakan{}).
			Where("id = ? AND user_id = ?", sesi.ID, sesi.UserID).
			Updates(map[string]interface{}{
				"name":      sesi.Name,
				"meal_date": sesi.MealDate,
				"meal_time": sesi.MealTime,
				"note":      sesi.Note,
			}).Error; err != nil {
			return err
		}

		if err := tx.Where("sesi_makan_id = ?", sesi.ID).Delete(&IsiPiring{}).Error; err != nil {
			return err
		}

		for i := range items {
			items[i].SesiMakanID = sesi.ID
		}
		if len(items) > 0 {
			if err := tx.Create(&items).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *Repository) Delete(ctx context.Context, id uint, userID uint) error {
	return r.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", id, userID).
		Delete(&SesiMakan{}).Error
}
