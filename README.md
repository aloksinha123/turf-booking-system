# ⚽ Enterprise Dynamic Turf Booking & Concurrency Engine

> A high-performance, event-driven sports facility booking & venue management platform built in **Go (Golang)**, **PostgreSQL**, **Redis**, and **React**. Engineered for microsecond transaction latencies, strict ACID compliance under extreme parallel load, dynamic yield pricing algorithms, real-time telemetry, and phone-scannable QR ticketing.

---

## 🚀 Core Architecture & Engineering Highlights

### 1. 🛡️ Transactional Booking & Row-Level Lock Engine
* **Zero Double-Booking Guarantee:** Prevents race conditions during high-demand booking surges by acquiring exclusive row-level PostgreSQL locks (`SELECT ... FOR UPDATE`) inside atomic database transactions (`GORM`).
* **Microsecond Execution:** Handles 1,000+ concurrent reservation requests with deterministic lock ordering and low P99 latencies.

### 2. 👥 Split Payments ("Share the Bill") & Squad Engine
* **Invitational Cost Distribution:** Allows match organizers to split court booking costs among squad members via unique shareable invitation links.
* **30-Minute Auto-Refund Safety:** Real-time Redis-backed countdown timer. If squad contribution quota is unfulfilled within 30 minutes, funds are automatically returned without administrative intervention.

### 3. 🎯 Public Matchmaking & Squad System
* **Skill-Based Match Finder:** Automatically matches individual solo players into teams based on skill levels (Beginner, Intermediate, Advanced, Pro).
* **Atomic Progress Tracking:** Dynamic team size capacity locks and automatic waitlist queueing.

### 4. 📈 Algorithmic Dynamic Yield & Surge Pricing Engine
* **Airline/Hotel Style Priority Rules Engine:** Evaluates hierarchical pricing rules (Priority #100 > #50 > #10) based on peak hours, holidays, and demand velocity.
* **Price Bounds & Checkout Lock:** Implements strict floor/ceiling bounds and locks checkout prices for 5 minutes during payment processing to prevent dynamic price slippage.
* **Promotional Coupons Engine:** Supports percentage-based promo codes (`TURF20`) with configurable compatibility flags for surge pricing.

### 5. 💳 Stripe Webhook Idempotency & QR Ticket Engine
* **HMAC SHA-256 Webhook Verification:** Verifies Stripe webhook signatures for all payment states (`Payment Succeeded`, `Failed`, `Refunded`, `Chargeback`).
* **Idempotency Guard:** Prevents duplicate transaction processing using unique Stripe idempotency keys in Redis.
* **Phone-Scannable QR Ticket Generator:** Generates native PNG QR codes (`skip2/go-qrcode`) embedding cryptographically verified booking hashes for venue gate check-in API verification.

### 6. ⚡ Real-Time WebSocket Telemetry & Event Store
* **Monotonic `seq_id` Event Stream:** High-throughput WebSocket hub broadcasting live slot locks, court status changes, and platform alerts.
* **Ring Buffer Catchup Sync (`/ws/replay`):** Ensures clients never miss state events during brief network disconnections or browser tab sleeps.

### 7. 🧪 Built-in Production Concurrency Stress Engine
* **10–1,000 Parallel Worker Load Generator:** Simulated load testing tool built directly into the admin command center to benchmark lock performance under stress.
* **Metrics & Reporting:** Real-time P50/P95/P99 latency distribution charts, status breakdown, and downloadable CSV benchmark reports.

### 8. 🎛️ Cyberpunk Admin Command Center UI
* **Category Focus Navigation:** 5 isolated view modes (`Overview & Analytics`, `Inventory & Slots`, `Yield & Coupons`, `Security Audit Log`, `Concurrency Stress`).
* **Security Audit Trail:** Logs all administrative operations with admin IP addresses, roles, and timestamps for compliance auditing.

---

## 🛠️ Technology Stack

| Layer | Technology / Tool |
|---|---|
| **Backend Engine** | Go (Golang) 1.22+, Gin Gonic Framework |
| **Database & ORM** | PostgreSQL 15+, GORM |
| **Cache & Event Bus** | Redis Pub/Sub, Monotonic Event Ring Buffer |
| **Payments & Webhooks**| Stripe API, HMAC SHA-256 Signature Verification |
| **QR Code Engine** | `github.com/skip2/go-qrcode` (Native PNG Generator) |
| **Real-Time Layer** | Goroutine-backed WebSockets with Auto-Reconnect & Replay |
| **Frontend UI** | React 18, Vite, TailwindCSS (Dark Glassmorphic Theme) |

---

## 📊 System Architecture & Data Flow

```
                                  +------------------------------------+
                                  |    React Frontend Command Center   |
                                  +-----------------+------------------+
                                                    |
                                         HTTP / REST | WebSockets (WS)
                                                    v
                                  +-----------------+------------------+
                                  |     Go (Gin) API Gateway Router    |
                                  +--------+------------------+--------+
                                           |                  |
                    +----------------------+                  +----------------------+
                    |                                                                |
                    v                                                                v
   +----------------+-----------------+                              +---------------+-----------------+
   |      PostgreSQL Database          |                              |          Redis Engine           |
   | (SELECT ... FOR UPDATE Row Locks) |                              |  (Pub/Sub, Idempotency, Buffer) |
   +----------------+-----------------+                              +---------------+-----------------+
                    |                                                                |
                    +----------------------+-----------------------------------------+
                                           |
                                           v
                                +----------+----------+
                                |  Stripe Payment Gateway |
                                +---------------------+
```

---

## 🚦 System API Reference

### Public & Booking Endpoints
| Endpoint | Method | Description | Concurrency / Security |
|---|---|---|---|
| `/api/v1/slots/available` | `GET` | Fetch open slots with dynamic surge price calculation | Read-Committed Isolation |
| `/api/v1/slots/book` | `POST` | Execute atomic slot reservation & payment intent | `SELECT FOR UPDATE` Lock |
| `/api/v1/split-payment/create` | `POST` | Initialize split payment invitation link | Redis Quota Lock |
| `/api/v1/matchmaking/join` | `POST` | Join public match squad waitlist | Atomic Team Count Lock |
| `/api/v1/stripe/webhook` | `POST` | Verified Stripe Webhook receiver | HMAC SHA-256 Signature Check |

### Admin Command Center Endpoints
| Endpoint | Method | Description | Role / Security |
|---|---|---|---|
| `/admin/slots/generate` | `POST` | Generate daily 10 AM–10 PM slot matrix | Owner / Admin |
| `/admin/multiplier` | `POST` | Apply global dynamic surge multiplier | Owner / Admin |
| `/admin/pricing-rules` | `POST` | Create prioritized dynamic yield rule | Owner / Admin |
| `/admin/activity-logs` | `GET` | Audit trail of all admin operations | Security Compliance |
| `/admin/stress-test` | `POST` | Trigger 10–1000 worker load benchmark | Telemetry Benchmarking |

---

## 💬 System Design Interview Q&A

### Q1. How does the system handle 1,000 users clicking "Book Now" on the exact same slot at the exact same millisecond?
**Answer:** The Go backend opens an explicit PostgreSQL database transaction (`db.Begin()`) and executes `Clauses(clause.Locking{Strength: "UPDATE"})`, which translates to native `SELECT ... FOR UPDATE` in PostgreSQL. 
* The **first request** acquires the exclusive row-level lock on that specific slot ID.
* The remaining **999 concurrent requests** block safely in PostgreSQL lock queues.
* Once the first request verifies `is_booked == false`, sets `is_booked = true`, and commits the transaction, the lock is released.
* The queued requests acquire the lock one by one, immediately read `is_booked == true`, rollback instantly, and return a clean `409 Conflict` (Slot Already Booked) response. Zero double-bookings can ever occur.

### Q2. How does the Split Payment system handle unfulfilled player payments?
**Answer:** When an organizer creates a split booking, a 30-minute hold window is registered in Redis alongside participant quotas. A background Go worker monitors expiration. If all squad members fail to pay before the 30-minute mark, the slot is automatically released back to public availability, and Stripe partial refunds are triggered asynchronously.

---

## 📑 Resume Bullet Points (Copy & Paste Ready)

Here are ready-to-use resume bullet points formatted for Software Engineer, Backend Developer, and Full-Stack roles:

### 🔹 Option A: Backend & Systems Engineer Resume Bullet Points
* **Architected a high-concurrency Sports Facility Booking Engine in Go (Golang) & PostgreSQL**, enforcing ACID transactions with row-level locks (`SELECT FOR UPDATE`) to eliminate double-bookings across 1,000+ simultaneous requests.
* **Engineered an Algorithmic Dynamic Yield Pricing Engine** with priority rule hierarchies (Priority #100 > #50 > #10) and checkout price locking, driving automated demand-based surge pricing.
* **Built an event-driven Webhook & Idempotency Pipeline** using Stripe, HMAC SHA-256 signature verification, and Redis idempotency keys to handle asynchronous payment lifecycle events and automated refunds.
* **Implemented real-time telemetry via WebSockets with monotonic sequence ordering** and a Ring Buffer event store (`/ws/replay`), ensuring zero state loss during client reconnections.

### 🔹 Option B: Full-Stack Engineer Resume Bullet Points
* **Developed an enterprise Sports Turf Booking & Split-Payment Platform** using Go, PostgreSQL, Redis, and React (Vite/TailwindCSS).
* **Built a "Share the Bill" Split-Payment System** with real-time Redis quota tracking and an automated 30-minute expiration auto-refund safeguard.
* **Created a Production Concurrency Stress Testing Engine** benchmarking 10–1,000 parallel workers with microsecond P50/P95/P99 latency distribution analytics and CSV export capability.
* **Designed a phone-scannable QR Ticket Generation & Check-In Verification API** utilizing `skip2/go-qrcode` for instant venue gate validation.

---

## 🛠️ Local Development & Quick Start

### 1. Prerequisites
* Go 1.22+
* PostgreSQL 15+
* Node.js 18+ & npm

### 2. Environment Variables (`.env`)
```env
PORT=8085
DATABASE_URL=postgres://postgres:postgres@localhost:5432/turf_db?sslmode=disable
REDIS_URL=localhost:6379
JWT_SECRET=your_jwt_secret_key
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

### 3. Run Backend (Go)
```bash
go run main.go
```

### 4. Run Frontend (React / Vite)
```bash
cd turf-dashboard-ui
npm install
npm run dev
```