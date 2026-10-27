package piring

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

func (s *Service) Create(ctx context.Context, req CreateSesiMakanRequest, userID uint) (SesiMakan, error) {
	cleanName := strings.TrimSpace(req.Name)
	cleanTime := strings.TrimSpace(req.MealTime)

	existing, err := s.repo.FindByDateTimeAndName(ctx, userID, req.MealDate, cleanTime, cleanName)
	if err == nil && existing != nil && existing.ID != 0 {
		existingMap := make(map[uint]int)
		for i, it := range existing.IsiPiring {
			existingMap[it.MakananID] = i
		}

		updatedItems := make([]IsiPiring, len(existing.IsiPiring))
		copy(updatedItems, existing.IsiPiring)

		for _, item := range req.IsiPiring {
			if idx, found := existingMap[item.MakananID]; found {
				updatedItems[idx].Gram += item.Gram
			} else {
				updatedItems = append(updatedItems, IsiPiring{
					SesiMakanID: existing.ID,
					MakananID:   item.MakananID,
					Gram:        item.Gram,
					ServingUnit: item.ServingUnit,
					ServingNote: item.ServingNote,
				})
				existingMap[item.MakananID] = len(updatedItems) - 1
			}
		}

		if req.Note != nil && strings.TrimSpace(*req.Note) != "" {
			existing.Note = req.Note
		}

		if err := s.repo.Update(ctx, existing, updatedItems); err != nil {
			return SesiMakan{}, err
		}

		return s.repo.GetByID(ctx, existing.ID, userID)
	}

	var items []IsiPiring
	for _, item := range req.IsiPiring {
		items = append(items, IsiPiring{
			MakananID:   item.MakananID,
			Gram:        item.Gram,
			ServingUnit: item.ServingUnit,
			ServingNote: item.ServingNote,
		})
	}

	sesi := SesiMakan{
		Name:      cleanName,
		MealDate:  req.MealDate,
		MealTime:  cleanTime,
		Note:      req.Note,
		UserID:    userID,
		IsiPiring: items,
	}

	if err := s.repo.Create(ctx, &sesi); err != nil {
		return SesiMakan{}, err
	}

	return s.repo.GetByID(ctx, sesi.ID, userID)
}

func (s *Service) List(ctx context.Context, userID uint, date string) ([]SesiMakan, error) {
	// Konsolidasikan duplikat pada waktu dan nama yang sama terlebih dahulu jika ada
	_ = s.repo.ConsolidateDuplicates(ctx, userID)
	return s.repo.ListByUserID(ctx, userID, strings.TrimSpace(date))
}

func (s *Service) GetByID(ctx context.Context, id uint, userID uint) (SesiMakan, error) {
	return s.repo.GetByID(ctx, id, userID)
}

func (s *Service) Update(ctx context.Context, id uint, req UpdateSesiMakanRequest, userID uint) (SesiMakan, error) {
	existing, err := s.repo.GetByID(ctx, id, userID)
	if err != nil {
		return SesiMakan{}, err
	}

	var items []IsiPiring
	for _, item := range req.IsiPiring {
		items = append(items, IsiPiring{
			SesiMakanID: id,
			MakananID:   item.MakananID,
			Gram:        item.Gram,
			ServingUnit: item.ServingUnit,
			ServingNote: item.ServingNote,
		})
	}

	existing.Name = strings.TrimSpace(req.Name)
	existing.MealDate = req.MealDate
	existing.MealTime = strings.TrimSpace(req.MealTime)
	existing.Note = req.Note

	if err := s.repo.Update(ctx, &existing, items); err != nil {
		return SesiMakan{}, err
	}

	return s.repo.GetByID(ctx, id, userID)
}

func (s *Service) Delete(ctx context.Context, id uint, userID uint) error {
	return s.repo.Delete(ctx, id, userID)
}
