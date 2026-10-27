package makanan

type Makanan struct {
	ID           uint    `json:"id" gorm:"primaryKey;column:id"`
	Name         string  `json:"name" gorm:"column:name;type:varchar;not null;index"`
	Calories     float64 `json:"calories" gorm:"column:calories;type:float8;not null"`
	Proteins     float64 `json:"proteins" gorm:"column:proteins;type:float8;not null"`
	Fat          float64 `json:"fat" gorm:"column:fat;type:float8;not null"`
	Carbohydrate float64 `json:"carbohydrate" gorm:"column:carbohydrate;type:float8;not null"`
	Image        *string `json:"image,omitempty" gorm:"column:image;type:text"`
}

func (Makanan) TableName() string {
	return "makanan"
}