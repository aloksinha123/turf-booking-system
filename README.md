# Dynamic Turf Booking System (High-Concurrency Backend)

A production-grade, highly concurrent sports facility booking engine built in Go, designed to simulate microservice-level transactional integrity and real-time algorithmic surge pricing.

## 🚀 Core Architecture Highlights

*   **Language & Framework:** Go (Golang) + Gin Gonic. Chosen for high-throughput, minimal memory footprint, and native goroutine handling.
*   **Database & ORM:** PostgreSQL + GORM. Relational schema designed for transactional write efficiency.
*   **Concurrency Control:** Implemented strict row-level locking via PostgreSQL `SELECT ... FOR UPDATE` inside atomic database transactions to eliminate race conditions and double-booking vulnerabilities.
*   **Algorithmic Surge Engine:** Features dynamic 1.5x pricing markups triggered automatically during peak operational hours (17:00 - 22:00).

---

## 🛣️ System API Design

| Endpoint | Method | Purpose | Concurrency Safety |
| :--- | :--- | :--- | :--- |
| `/slots/available` | `GET` | Fetches non-booked slots with computed dynamic pricing. | Read-Committed Isolation |
| `/slots/book` | `POST` | Executes atomic booking under explicit row lock. | `FOR UPDATE` Transaction Lock |
| `/slots/reset` | `POST` | Flushes transaction logs and resets slot states (Dev Mode). | Cascade Truncate / Update |

---

## 💬 System Design Interview Framework

### Q1. How does the system handle 10,000 users clicking "Book Now" on the exact same slot?
**Answer:** The system initializes a GORM database transaction (`db.Begin()`) and queries the specific slot using `Clauses(clause.Locking{Strength: "UPDATE"})`. This translates to a native `SELECT ... FOR UPDATE` in PostgreSQL. The first worker thread secures the exclusive row-level lock; all subsequent threads trying to access the same row are placed in a queue. Once the first transaction commits and marks `is_booked = true`, the remaining queued threads read the updated state, abort instantly, and safely return a `409 Conflict` error, guaranteeing zero data inconsistency.

### Q2. Why use Go instead of standard runtime loops for this scale?
**Answer:** Go compiles directly to machine code and utilizes "M:N" scheduling (Goroutines), meaning millions of concurrent checks consume minimal overhead compared to heavy OS-level threads. Combined with strict database-level row locking rather than application-level mutexes, the system remains stateless and horizontally scalable across multiple server nodes.