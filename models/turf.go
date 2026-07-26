package models

// Turf represents a physical sports facility that can have multiple bookable slots
type Turf struct {
	ID          uint    `gorm:"primaryKey" json:"id"`
	Name        string  `gorm:"type:varchar(100);not null" json:"name"`
	Location    string  `gorm:"type:varchar(200);not null" json:"location"`
	Description string  `gorm:"type:text" json:"description"`
	BasePrice   float64 `gorm:"type:decimal(10,2);not null" json:"base_price"`
	Slots       []Slot  `gorm:"foreignKey:TurfID" json:"slots,omitempty"`
}
