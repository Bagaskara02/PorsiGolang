package makanan

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

func (r *Repository) List(ctx context.Context, search string, limit, offset int) ([]Makanan, int64, error) {
	var items []Makanan
	var total int64

	query := r.db.WithContext(ctx).Model(&Makanan{})
	if search != "" {
		query = query.Where("name ILIKE ?", "%"+search+"%")
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := query.Order("id ASC").Limit(limit).Offset(offset).Find(&items).Error
	return items, total, err
}

func (r *Repository) GetByID(ctx context.Context, id uint) (Makanan, error) {
	var item Makanan
	err := r.db.WithContext(ctx).First(&item, id).Error
	return item, err
}