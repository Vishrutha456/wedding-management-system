-- =====================================================================
--  WEDDING MANAGEMENT AND VENDORING SYSTEM
--  queries.sql  -  SQL queries for the DBMS demonstration / viva
--
--  How to use: Supabase -> SQL Editor -> New query -> paste ONE query
--  (or a whole section) -> Run.  Highlight a single query and press
--  Ctrl+Enter to run only that one.
--
--  NOTE: The SQL Editor runs as the database owner, so Row Level
--  Security does not hide anything here - you see ALL rows.
--  (On the website, RLS limits each customer to their own data.)
--
--  Sections
--    A. Basic CRUD          (SELECT, INSERT, UPDATE, DELETE)
--    B. Filtering           (WHERE, ORDER BY, LIKE, BETWEEN, IN, IS NULL)
--    C. Joins               (INNER JOIN, LEFT JOIN, multi-table)
--    D. Aggregates          (COUNT, SUM, AVG, MIN, MAX, GROUP BY, HAVING)
--    E. Subqueries          (IN, NOT EXISTS, scalar, correlated)
--    F. Project queries     (availability, balance, ratings, reports)
--    G. Views & functions   (booking_summary, vendor_rating, available_packages)
--    H. Constraint demos    (queries that SHOULD fail - shows integrity rules)
-- =====================================================================


-- =====================================================================
-- A. BASIC CRUD
-- =====================================================================

-- A1. SELECT: all venues
SELECT * FROM venue;

-- A2. SELECT specific columns
SELECT venue_name, city, capacity, rent_per_day FROM venue;

-- A3. INSERT: add a new venue
INSERT INTO venue (venue_name, address, city, capacity, rent_per_day, contact_phone)
VALUES ('Royal Lotus Convention Hall', 'Basavanagudi', 'Bengaluru', 900, 175000, '9845100099');

-- A4. UPDATE: increase that venue's rent by 10%
UPDATE venue
SET    rent_per_day = rent_per_day * 1.10
WHERE  venue_name = 'Royal Lotus Convention Hall';

-- A5. DELETE: remove that venue again
DELETE FROM venue
WHERE  venue_name = 'Royal Lotus Convention Hall';


-- =====================================================================
-- B. FILTERING AND SORTING
-- =====================================================================

-- B1. WHERE + ORDER BY: venues in Bengaluru, cheapest first
SELECT venue_name, capacity, rent_per_day
FROM   venue
WHERE  city = 'Bengaluru'
ORDER  BY rent_per_day ASC;

-- B2. LIKE: vendors whose name contains 'Photo' (ILIKE = case-insensitive)
SELECT business_name, city
FROM   vendor
WHERE  business_name ILIKE '%photo%';

-- B3. BETWEEN: packages priced from 10,000 to 50,000
SELECT package_name, price, price_unit
FROM   service_package
WHERE  price BETWEEN 10000 AND 50000
ORDER  BY price;

-- B4. IN: vendors in Mysuru or Mangaluru
SELECT business_name, city
FROM   vendor
WHERE  city IN ('Mysuru', 'Mangaluru');

-- B5. IS NULL: weddings that have not chosen a venue yet
SELECT wedding_id, bride_name, groom_name, wedding_date
FROM   wedding
WHERE  venue_id IS NULL;

-- B6. Upcoming weddings (date in the future, not cancelled)
SELECT wedding_id, bride_name || ' & ' || groom_name AS couple, wedding_date, status
FROM   wedding
WHERE  wedding_date >= CURRENT_DATE
  AND  status <> 'Cancelled'
ORDER  BY wedding_date;

-- B7. Pending bookings
SELECT booking_id, wedding_id, package_id, service_date, agreed_amount
FROM   booking
WHERE  booking_status = 'Pending'
ORDER  BY service_date;

-- B8. Unverified vendors (waiting for admin verification)
SELECT vendor_id, business_name, city
FROM   vendor
WHERE  verified_by IS NULL;


-- =====================================================================
-- C. JOINS
-- =====================================================================

-- C1. INNER JOIN: every vendor with its category name
SELECT v.business_name, c.category_name, v.city
FROM   vendor v
JOIN   vendor_category c ON c.category_id = v.category_id
ORDER  BY c.category_name, v.business_name;

-- C2. INNER JOIN: all weddings of one customer (Priya)
SELECT w.wedding_id, w.bride_name, w.groom_name, w.wedding_date, w.status
FROM   wedding w
JOIN   customer cu ON cu.customer_id = w.customer_id
WHERE  cu.email = 'priya@example.com'
ORDER  BY w.wedding_date;

-- C3. LEFT JOIN: every wedding with its venue (weddings without a venue still appear)
SELECT w.bride_name || ' & ' || w.groom_name AS couple,
       w.wedding_date,
       COALESCE(ve.venue_name, 'Not chosen yet') AS venue
FROM   wedding w
LEFT   JOIN venue ve ON ve.venue_id = w.venue_id
ORDER  BY w.wedding_date;

-- C4. All packages of one vendor
SELECT p.package_name, p.price, p.price_unit, p.is_active
FROM   service_package p
JOIN   vendor v ON v.vendor_id = p.vendor_id
WHERE  v.business_name = 'Lens & Light Studio';

-- C5. Five-table join: bookings of a wedding with vendor and category
--     wedding -> booking -> service_package -> vendor -> vendor_category
SELECT b.booking_id,
       v.business_name,
       c.category_name,
       p.package_name,
       b.service_date,
       b.agreed_amount,
       b.booking_status
FROM   booking b
JOIN   wedding         w ON w.wedding_id  = b.wedding_id
JOIN   service_package p ON p.package_id  = b.package_id
JOIN   vendor          v ON v.vendor_id   = p.vendor_id
JOIN   vendor_category c ON c.category_id = v.category_id
WHERE  w.bride_name = 'Priya' AND w.groom_name = 'Arjun'
ORDER  BY b.service_date;

-- C6. LEFT JOIN: vendors with their reviews (vendors with no review show NULL)
SELECT v.business_name, r.rating, r.comments
FROM   vendor v
LEFT   JOIN service_package p ON p.vendor_id  = v.vendor_id
LEFT   JOIN booking         b ON b.package_id = p.package_id
LEFT   JOIN review          r ON r.booking_id = b.booking_id
WHERE  v.verified_by IS NOT NULL
ORDER  BY v.business_name;


-- =====================================================================
-- D. AGGREGATE FUNCTIONS, GROUP BY, HAVING
-- =====================================================================

-- D1. COUNT: number of rows in each main table
SELECT (SELECT COUNT(*) FROM customer) AS customers,
       (SELECT COUNT(*) FROM wedding)  AS weddings,
       (SELECT COUNT(*) FROM vendor)   AS vendors,
       (SELECT COUNT(*) FROM booking)  AS bookings,
       (SELECT COUNT(*) FROM payment)  AS payments;

-- D2. GROUP BY: number of vendors in each category
SELECT c.category_name, COUNT(v.vendor_id) AS vendor_count
FROM   vendor_category c
LEFT   JOIN vendor v ON v.category_id = c.category_id
GROUP  BY c.category_name
ORDER  BY vendor_count DESC;

-- D3. MIN / MAX / AVG: package price range per category
SELECT c.category_name,
       MIN(p.price)            AS cheapest,
       MAX(p.price)            AS costliest,
       ROUND(AVG(p.price), 2)  AS average_price
FROM   service_package p
JOIN   vendor v          ON v.vendor_id   = p.vendor_id
JOIN   vendor_category c ON c.category_id = v.category_id
WHERE  p.is_active
GROUP  BY c.category_name
ORDER  BY c.category_name;

-- D4. SUM: total booking amount per wedding (cancelled bookings excluded)
SELECT w.bride_name || ' & ' || w.groom_name AS couple,
       COUNT(b.booking_id)  AS bookings,
       SUM(b.agreed_amount) AS total_booked
FROM   wedding w
JOIN   booking b ON b.wedding_id = w.wedding_id
WHERE  b.booking_status <> 'Cancelled'
GROUP  BY w.wedding_id, couple
ORDER  BY total_booked DESC;

-- D5. SUM: total successful payments received
SELECT SUM(amount) AS total_received
FROM   payment
WHERE  payment_status = 'Success';

-- D6. GROUP BY payment mode
SELECT payment_mode, COUNT(*) AS payments, SUM(amount) AS total
FROM   payment
WHERE  payment_status = 'Success'
GROUP  BY payment_mode
ORDER  BY total DESC;

-- D7. HAVING: weddings whose total booking amount is more than 1,00,000
SELECT w.wedding_id, w.bride_name || ' & ' || w.groom_name AS couple,
       SUM(b.agreed_amount) AS total_booked
FROM   wedding w
JOIN   booking b ON b.wedding_id = w.wedding_id
WHERE  b.booking_status <> 'Cancelled'
GROUP  BY w.wedding_id, couple
HAVING SUM(b.agreed_amount) > 100000;

-- D8. HAVING: categories that have more than one vendor
SELECT c.category_name, COUNT(*) AS vendors
FROM   vendor v
JOIN   vendor_category c ON c.category_id = v.category_id
GROUP  BY c.category_name
HAVING COUNT(*) > 1;


-- =====================================================================
-- E. SUBQUERIES
-- =====================================================================

-- E1. Subquery with IN: customers who have at least one booking
SELECT full_name, email
FROM   customer
WHERE  customer_id IN (SELECT w.customer_id
                       FROM   wedding w
                       JOIN   booking b ON b.wedding_id = w.wedding_id);

-- E2. NOT EXISTS: vendors that have never been booked
SELECT v.business_name
FROM   vendor v
WHERE  NOT EXISTS (SELECT 1
                   FROM   service_package p
                   JOIN   booking b ON b.package_id = p.package_id
                   WHERE  p.vendor_id = v.vendor_id);

-- E3. Scalar subquery: packages priced above the average package price
SELECT package_name, price
FROM   service_package
WHERE  price > (SELECT AVG(price) FROM service_package)
ORDER  BY price DESC;

-- E4. Correlated subquery: each venue with how many weddings it hosts
SELECT ve.venue_name,
       (SELECT COUNT(*) FROM wedding w WHERE w.venue_id = ve.venue_id) AS weddings
FROM   venue ve
ORDER  BY weddings DESC;


-- =====================================================================
-- F. PROJECT QUERIES
-- =====================================================================

-- F1. AVAILABILITY: packages that are FREE on a given date
--     A package is unavailable if it has a NON-cancelled booking that day.
--     (change the date to test)
SELECT p.package_id, v.business_name, p.package_name, p.price
FROM   service_package p
JOIN   vendor v ON v.vendor_id = p.vendor_id
WHERE  p.is_active
  AND  v.verified_by IS NOT NULL
  AND  NOT EXISTS (SELECT 1 FROM booking b
                   WHERE  b.package_id   = p.package_id
                     AND  b.service_date = CURRENT_DATE + 45
                     AND  b.booking_status <> 'Cancelled')
ORDER  BY v.business_name;

-- F2. AVAILABILITY of one package on one date (true = free)
SELECT NOT EXISTS (SELECT 1 FROM booking
                   WHERE  package_id = 3
                     AND  service_date = CURRENT_DATE + 45
                     AND  booking_status <> 'Cancelled') AS is_available;

-- F3. BALANCE per booking:  balance = agreed_amount - SUM(successful payments)
--     (calculated - it is never stored in a column)
SELECT b.booking_id,
       b.agreed_amount,
       COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status = 'Success'), 0) AS total_paid,
       b.agreed_amount
         - COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status = 'Success'), 0) AS balance
FROM   booking b
LEFT   JOIN payment p ON p.booking_id = b.booking_id
WHERE  b.booking_status <> 'Cancelled'
GROUP  BY b.booking_id
ORDER  BY balance DESC;

-- F4. BALANCE per wedding (total booked, paid and due)
SELECT w.bride_name || ' & ' || w.groom_name AS couple,
       SUM(bs.agreed_amount) AS total_booked,
       SUM(bs.total_paid)    AS total_paid,
       SUM(bs.balance)       AS balance_due
FROM   booking_summary bs
JOIN   wedding w ON w.wedding_id = bs.wedding_id
WHERE  bs.booking_status <> 'Cancelled'
GROUP  BY w.wedding_id, couple
ORDER  BY balance_due DESC;

-- F5. Vendors with their AVERAGE RATING (only vendors that have reviews)
SELECT v.business_name,
       COUNT(r.review_id)          AS reviews,
       ROUND(AVG(r.rating), 1)     AS avg_rating
FROM   vendor v
JOIN   service_package p ON p.vendor_id  = v.vendor_id
JOIN   booking         b ON b.package_id = p.package_id
JOIN   review          r ON r.booking_id = b.booking_id
GROUP  BY v.vendor_id, v.business_name
ORDER  BY avg_rating DESC, reviews DESC;

-- F6. MOST-BOOKED vendors (cancelled bookings not counted)
SELECT v.business_name, COUNT(b.booking_id) AS times_booked
FROM   vendor v
JOIN   service_package p ON p.vendor_id  = v.vendor_id
JOIN   booking         b ON b.package_id = p.package_id
WHERE  b.booking_status <> 'Cancelled'
GROUP  BY v.vendor_id, v.business_name
ORDER  BY times_booked DESC
LIMIT  5;

-- F7. MOST-BOOKED packages
SELECT p.package_name, v.business_name, COUNT(*) AS times_booked
FROM   booking b
JOIN   service_package p ON p.package_id = b.package_id
JOIN   vendor v          ON v.vendor_id  = p.vendor_id
WHERE  b.booking_status <> 'Cancelled'
GROUP  BY p.package_id, p.package_name, v.business_name
ORDER  BY times_booked DESC;

-- F8. REVENUE per vendor (successful payments received)
SELECT v.business_name, SUM(pay.amount) AS revenue
FROM   payment pay
JOIN   booking         b ON b.booking_id = pay.booking_id
JOIN   service_package p ON p.package_id = b.package_id
JOIN   vendor          v ON v.vendor_id  = p.vendor_id
WHERE  pay.payment_status = 'Success'
GROUP  BY v.vendor_id, v.business_name
ORDER  BY revenue DESC;

-- F9. REVENUE per category
SELECT c.category_name, SUM(pay.amount) AS revenue
FROM   payment pay
JOIN   booking         b ON b.booking_id  = pay.booking_id
JOIN   service_package p ON p.package_id  = b.package_id
JOIN   vendor          v ON v.vendor_id   = p.vendor_id
JOIN   vendor_category c ON c.category_id = v.category_id
WHERE  pay.payment_status = 'Success'
GROUP  BY c.category_name
ORDER  BY revenue DESC;

-- F10. ADMIN REPORT: one-row dashboard summary
SELECT
    (SELECT COUNT(*) FROM customer)                                         AS total_customers,
    (SELECT COUNT(*) FROM wedding WHERE status <> 'Cancelled')              AS active_weddings,
    (SELECT COUNT(*) FROM vendor  WHERE verified_by IS NOT NULL)            AS verified_vendors,
    (SELECT COUNT(*) FROM vendor  WHERE verified_by IS NULL)                AS pending_verifications,
    (SELECT COUNT(*) FROM booking WHERE booking_status <> 'Cancelled')      AS active_bookings,
    (SELECT COALESCE(SUM(amount), 0) FROM payment WHERE payment_status = 'Success') AS total_received;

-- F11. ADMIN REPORT: bookings by status
SELECT booking_status, COUNT(*) AS bookings, SUM(agreed_amount) AS amount
FROM   booking
GROUP  BY booking_status
ORDER  BY bookings DESC;

-- F12. Weddings where guests exceed the venue capacity (should return no rows)
SELECT w.bride_name, w.guest_count, ve.venue_name, ve.capacity
FROM   wedding w
JOIN   venue ve ON ve.venue_id = w.venue_id
WHERE  w.guest_count > ve.capacity;


-- =====================================================================
-- G. VIEWS AND FUNCTIONS (defined in schema.sql)
-- =====================================================================

-- G1. VIEW booking_summary: bookings with vendor, total paid and balance
SELECT couple, business_name, package_name, agreed_amount, total_paid, balance, booking_status
FROM   booking_summary
ORDER  BY balance DESC;

-- G2. VIEW vendor_rating: average rating of every verified vendor
SELECT * FROM vendor_rating ORDER BY avg_rating DESC NULLS LAST;

-- G3. FUNCTION available_packages(date): free packages on a date
SELECT * FROM available_packages(CURRENT_DATE + 45);

-- G4. FUNCTION is_package_available(package_id, date)
SELECT is_package_available(3, CURRENT_DATE + 45) AS package_3_free;   -- false: already booked
SELECT is_package_available(3, CURRENT_DATE + 46) AS package_3_free;   -- true


-- =====================================================================
-- H. CONSTRAINT DEMOS  -  each of these SHOULD FAIL with an error.
--    Run them ONE AT A TIME to show how the database protects the data.
-- =====================================================================

-- H1. CHECK constraint: capacity must be > 0
--     ERROR: violates check constraint "venue_capacity_check"
INSERT INTO venue (venue_name, address, city, capacity, rent_per_day)
VALUES ('Bad Venue', 'Nowhere', 'Bengaluru', 0, 1000);

-- H2. CHECK constraint: rating must be between 1 and 5
--     ERROR: violates check constraint "review_rating_check"
UPDATE review SET rating = 7 WHERE review_id = 1;

-- H3. FOREIGN KEY: a booking must point to an existing wedding
--     ERROR: violates foreign key constraint "booking_wedding_id_fkey"
INSERT INTO booking (wedding_id, package_id, service_date, agreed_amount)
VALUES (9999, 1, CURRENT_DATE + 10, 1000);

-- H4. UNIQUE: two customers cannot have the same email
--     ERROR: duplicate key value violates unique constraint "customer_email_key"
UPDATE customer SET email = 'priya@example.com' WHERE email = 'rahul@example.com';

-- H5. PARTIAL UNIQUE INDEX (no double booking): package 3 is already
--     booked on CURRENT_DATE + 45, so booking it again for that date fails.
--     ERROR: duplicate key value violates unique constraint "uq_package_date_active"
INSERT INTO booking (wedding_id, package_id, service_date, agreed_amount)
VALUES (3, 3, CURRENT_DATE + 45, 70000);

-- H6. TRIGGER payment_rules: payment more than the balance is rejected
--     ERROR: Payment exceeds remaining balance
INSERT INTO payment (booking_id, amount, payment_mode, payment_type)
VALUES (6, 999999, 'Cash', 'Final');

-- H7. ON DELETE RESTRICT: a wedding that has bookings cannot be deleted
--     ERROR: violates foreign key constraint "booking_wedding_id_fkey"
DELETE FROM wedding WHERE wedding_id = 1;

-- End of queries.sql
