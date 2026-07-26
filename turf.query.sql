SELECT * FROM slots;

SELECT * FROM bookings;

DROP TABLE IF EXISTS bookings;

DROP TABLE IF EXISTS slots;


DROP TABLE IF EXISTS users;

SELECT * FROM slots ORDER BY date DESC, start_time ASC;


INSERT INTO slots (turf_id, start_time, end_time, base_price, is_booked, date)
VALUES (1, '10:00', '11:00', 1000, false, '2026-07-21');

-- Ye dekhiye ki koi aisi booking toh nahi jisme "pending" status ho aur fir bhi players badh gaye ho?
SELECT 
    b.id AS booking_id,
    b.status AS payment_status,
    b.is_matchmaking,
    s.current_players AS slot_players
FROM bookings b
JOIN slots s ON b.slot_id = s.id
WHERE b.status = 'pending';
-- (Ab naye flow ke according jab tak status 'paid' nahi hota, slot mein current_players update nahi honge)



-- Galat Query (Jo Purana Dashboard Use Karta Tha):
SELECT count(*) AS fake_inflated_bookings FROM bookings;

-- Sahi Query (Jo Naya Dashboard Use Karta Hai):
SELECT count(*) AS real_active_bookings FROM bookings WHERE status = 'confirmed';


-- Kisi bhi split booking ke sabhi dost (split parts) check kariye:
SELECT * FROM booking_splits ORDER BY booking_id;

-- Aap dekhenge ki sabhi splits ke paas ab ek common 'stripe_client_secret' hai
SELECT 
    bs.split_token, 
    bs.amount_due, 
    bs.status, 
    bs.stripe_client_secret 
FROM booking_splits bs
WHERE bs.status = 'pending';


-- Saare slots ko available mark karne ke liye (Bina delete kiye):
UPDATE slots SET is_booked = false, is_locked = false, current_players = 0, matchmaking_status = 'closed';

-- Saari bookings flush karne ke liye:
TRUNCATE TABLE bookings CASCADE;



SELECT 
    state, 
    COUNT(*) AS connection_count 
FROM pg_stat_activity 
WHERE datname = 'godrej_turf_db' 
GROUP BY state;


SELECT 
    a.pid AS blocked_pid,
    a.query AS blocked_query,
    age(clock_timestamp(), a.query_start) AS waiting_duration,
    b.pid AS blocking_pid,
    b.query AS blocking_query
FROM pg_catalog.pg_stat_activity a
JOIN pg_catalog.pg_locks l1 ON a.pid = l1.pid AND NOT l1.granted
JOIN pg_catalog.pg_locks l2 ON l1.relation = l2.relation AND l2.granted
JOIN pg_catalog.pg_stat_activity b ON l2.pid = b.pid
WHERE a.datname = 'godrej_turf_db';



SELECT 
    pid, 
    locktype, 
    mode, 
    granted, 
    fastpath 
FROM pg_locks 
WHERE pid = pg_backend_pid() OR locktype = 'relation';


SELECT * FROM slots WHERE date = '2026-07-21' ORDER BY start_time ASC;

SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'slots';


-- Saari bookings dekhne ke liye (status: confirmed, pending, expired, etc.)
SELECT * FROM bookings ORDER BY booked_at DESC;

-- Booking ke split tokens aur payment links check karne ke liye
SELECT * FROM booking_splits ORDER BY id DESC;

SELECT id, name, phone, email, role FROM users;