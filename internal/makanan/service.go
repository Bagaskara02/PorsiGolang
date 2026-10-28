package makanan

import (
	"context"
	"strings"
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) List(ctx context.Context, search string, page, limit int) ([]Makanan, int64, error) {
	if limit <= 0 {
		limit = 20
	} else if limit > 2000 {
		limit = 2000
	}
	if page <= 0 {
		page = 1
	}
	offset := (page - 1) * limit
	return s.repo.List(ctx, strings.TrimSpace(search), limit, offset)
}

func (s *Service) GetByID(ctx context.Context, id uint) (Makanan, error) {
	return s.repo.GetByID(ctx, id)
}
