-- =====================================================================
--  WEDDING MANAGEMENT AND VENDORING SYSTEM
--  sample_data.sql  -  demo data for the whole workflow
--
--  BEFORE running this file, create these 4 users in
--  Supabase Dashboard -> Authentication -> Users -> Add user -> Create new user
--  (tick "Auto Confirm User"):
--
--      admin@wedding.com      (the admin)
--      priya@example.com      (customer)
--      rahul@example.com      (customer)
--      ananya@example.com     (customer)
--
--  Then: SQL Editor -> New query -> paste this file -> Run.
--  Safe to re-run: it empties the project tables first.
--  All dates are relative to TODAY, so the demo always has past
--  (completed) and upcoming weddings.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Check that the 4 login accounts exist
-- ---------------------------------------------------------------------
do $$
declare
    missing text;
begin
    select string_agg(e, ', ') into missing
    from unnest(array['admin@wedding.com','priya@example.com',
                      'rahul@example.com','ananya@example.com']) as e
    where not exists (select 1 from auth.users u where u.email = e);

    if missing is not null then
        raise exception 'Create these users first in Authentication -> Users: %', missing;
    end if;
end $$;


-- ---------------------------------------------------------------------
-- 1. Empty all project tables and restart the ID counters at 1
--    (auth.users is NOT touched)
-- ---------------------------------------------------------------------
truncate review, payment, booking, service_package, vendor,
         vendor_category, wedding, venue, admin, customer
         restart identity cascade;


-- ---------------------------------------------------------------------
-- 2. ADMIN and CUSTOMERS  (linked to their Supabase Auth accounts)
-- ---------------------------------------------------------------------
insert into admin (auth_user_id, username, email)
select id, 'admin', email from auth.users where email = 'admin@wedding.com';

insert into customer (auth_user_id, full_name, email, phone, address)
select id, 'Priya Sharma', email, '9845012345', '12, 5th Cross, Jayanagar, Bengaluru'
from auth.users where email = 'priya@example.com';

insert into customer (auth_user_id, full_name, email, phone, address)
select id, 'Rahul Verma', email, '9886054321', '45, Vani Vilas Road, Mysuru'
from auth.users where email = 'rahul@example.com';

insert into customer (auth_user_id, full_name, email, phone, address)
select id, 'Ananya Rao', email, '9900112233', '8, HSR Layout Sector 2, Bengaluru'
from auth.users where email = 'ananya@example.com';


-- ---------------------------------------------------------------------
-- 3. VENUES  (venue_id 1-6)
-- ---------------------------------------------------------------------
insert into venue (venue_name, address, city, capacity, rent_per_day, contact_phone) values
('Shubha Kalyana Mantapa',        '4th Block, Jayanagar',       'Bengaluru',  800, 150000, '9845100001'),  -- 1
('Lakeview Banquet Hall',         'Outer Ring Road, Hebbal',    'Bengaluru', 1200, 250000, '9845100002'),  -- 2
('Mysuru Heritage Palace Lawns',  'Nazarbad Main Road',         'Mysuru',    2000, 300000, '9845100003'),  -- 3
('Green Meadows Resort',          'Kanakapura Road',            'Bengaluru',  600, 180000, '9845100004'),  -- 4
('Sri Lakshmi Convention Centre', 'Vijayanagar 2nd Stage',      'Mysuru',    1000, 120000, '9845100005'),  -- 5
('Coastal Breeze Beach Resort',   'Ullal Beach Road',           'Mangaluru',  400, 200000, '9845100006');  -- 6


-- ---------------------------------------------------------------------
-- 4. VENDOR CATEGORIES  (category_id 1-7)
-- ---------------------------------------------------------------------
insert into vendor_category (category_name, description) values
('Photography',      'Wedding photography and videography'),       -- 1
('Catering',         'Food and beverage services'),                -- 2
('Decoration',       'Mandap, stage and floral decoration'),       -- 3
('Makeup',           'Bridal and family makeup artists'),          -- 4
('Music',            'Nadaswaram, live bands and DJs'),            -- 5
('Mehendi',          'Bridal and guest mehendi artists'),          -- 6
('Wedding Planning', 'End-to-end planning and coordination');      -- 7


-- ---------------------------------------------------------------------
-- 5. VENDORS  (vendor_id 1-12). verified_by = 1 means verified by admin 1.
--    Vendors 11 and 12 are NOT verified yet (verified_by is NULL).
-- ---------------------------------------------------------------------
insert into vendor (category_id, verified_by, business_name, owner_name, phone, email, city) values
(1, 1,    'Lens & Light Studio',         'Vikram Shetty',  '9900200001', 'lenslight@example.com',    'Bengaluru'),  -- 1
(1, 1,    'Candid Moments Photography',  'Deepa Nair',     '9900200002', 'candid@example.com',       'Mysuru'),     -- 2
(2, 1,    'Annapoorna Caterers',         'Ramesh Bhat',    '9900200003', 'annapoorna@example.com',   'Bengaluru'),  -- 3
(2, 1,    'Mysuru Bhojana Caterers',     'Suresh Gowda',   '9900200004', 'bhojana@example.com',      'Mysuru'),     -- 4
(3, 1,    'Petals & Drapes Decor',       'Kavitha Reddy',  '9900200005', 'petals@example.com',       'Bengaluru'),  -- 5
(4, 1,    'Glam by Meera',               'Meera Iyer',     '9900200006', 'glammeera@example.com',    'Bengaluru'),  -- 6
(5, 1,    'Nadaswara Melam Troupe',      'Krishnamurthy',  '9900200007', 'nadaswara@example.com',    'Mysuru'),     -- 7
(5, 1,    'DJ Beats Bengaluru',          'Aditya Kumar',   '9900200008', 'djbeats@example.com',      'Bengaluru'),  -- 8
(6, 1,    'Henna Art by Fathima',        'Fathima Begum',  '9900200009', 'henna@example.com',        'Bengaluru'),  -- 9
(7, 1,    'Shubh Vivah Planners',        'Nikhil Joshi',   '9900200010', 'shubhvivah@example.com',   'Bengaluru'),  -- 10
(2, null, 'Coastal Flavours Catering',   'Joseph D''Souza','9900200011', 'coastal@example.com',      'Mangaluru'),  -- 11 (unverified)
(1, null, 'Dream Frames Studio',         'Sanjay Patil',   '9900200012', 'dreamframes@example.com',  'Bengaluru');  -- 12 (unverified)


-- ---------------------------------------------------------------------
-- 6. SERVICE PACKAGES  (package_id 1-19)
-- ---------------------------------------------------------------------
insert into service_package (vendor_id, package_name, description, price, price_unit, is_active) values
(1,  'Silver Photography',        'One photographer, 500 edited photos, 1 album',            45000, 'Per Event', true),   -- 1
(1,  'Gold Photo + Video',        'Two photographers, cinematic video, 2 albums',            95000, 'Per Event', true),   -- 2
(2,  'Candid Wedding Story',      'Candid photography with same-day highlights reel',        70000, 'Per Event', true),   -- 3
(3,  'South Indian Veg Meals',    'Traditional meals served on banana leaf',                   450, 'Per Plate', true),   -- 4
(3,  'Premium Veg Buffet',        'North and South Indian buffet with live counters',          750, 'Per Plate', true),   -- 5
(4,  'Traditional Bale Ele Oota', 'Mysuru-style 21-item banana leaf meal',                     350, 'Per Plate', true),   -- 6
(5,  'Mandap Floral Decoration',  'Fresh flower mandap with entrance arch',                 120000, 'Per Event', true),   -- 7
(5,  'Reception Stage Decoration','LED backdrop, stage florals and seating',                 80000, 'Per Event', true),   -- 8
(6,  'Bridal HD Makeup',          'Bridal makeup, hairstyling and draping',                  25000, 'Per Event', true),   -- 9
(6,  'Family Makeup',             'Makeup for family members',                                3000, 'Per Hour',  true),   -- 10
(7,  'Nadaswaram for Muhurtham',  'Traditional nadaswaram and thavil ensemble',              18000, 'Per Event', true),   -- 11
(8,  'Sangeet DJ Night',          'DJ, sound system and dance-floor lighting',                8000, 'Per Hour',  true),   -- 12
(9,  'Bridal Mehendi',            'Full-hand and feet bridal design',                        12000, 'Per Event', true),   -- 13
(9,  'Guest Mehendi',             'Simple designs for guests',                                4000, 'Per Hour',  true),   -- 14
(10, 'Full Wedding Planning',     'Planning from engagement to reception',                  200000, 'Per Event', true),   -- 15
(10, 'Day-of Coordination',       'Coordinator team on the wedding day',                     15000, 'Per Day',   true),   -- 16
(11, 'Coastal Non-Veg Buffet',    'Mangalorean seafood buffet',                                900, 'Per Plate', true),   -- 17 (unverified vendor)
(12, 'Pre-Wedding Shoot',         'Outdoor pre-wedding photoshoot',                          30000, 'Per Event', true),   -- 18 (unverified vendor)
(2,  'Traditional Photography',   'Old package - no longer offered',                         40000, 'Per Event', false);  -- 19 (inactive)


-- ---------------------------------------------------------------------
-- 7. WEDDINGS  (wedding_id 1-4)
--    Priya has TWO weddings (her own + her sister's) -> CUSTOMER 1:N WEDDING
-- ---------------------------------------------------------------------
insert into wedding (customer_id, venue_id, bride_name, groom_name, wedding_date, guest_count, budget, status) values
((select customer_id from customer where email = 'priya@example.com'),
    2,    'Priya',  'Arjun',   current_date - 30,  700, 1500000, 'Completed'),   -- 1 (past)
((select customer_id from customer where email = 'rahul@example.com'),
    3,    'Sneha',  'Rahul',   current_date + 45,  900, 2000000, 'Confirmed'),   -- 2
((select customer_id from customer where email = 'ananya@example.com'),
    null, 'Ananya', 'Karthik', current_date + 90,  400,  800000, 'Planned'),     -- 3 (no venue yet)
((select customer_id from customer where email = 'priya@example.com'),
    4,    'Kavya',  'Rohan',   current_date + 120, 350, 1000000, 'Planned');     -- 4


-- ---------------------------------------------------------------------
-- 8. BOOKINGS  (booking_id 1-12)
--    agreed_amount = price x quantity, sometimes negotiated lower.
-- ---------------------------------------------------------------------
insert into booking (wedding_id, package_id, booking_date, service_date, quantity, agreed_amount, booking_status) values
-- Wedding 1 (Priya & Arjun) - finished
(1, 2,  current_date - 120, current_date - 30,   1,  95000, 'Completed'),   -- 1 photo + video
(1, 5,  current_date - 120, current_date - 30, 700, 500000, 'Completed'),   -- 2 buffet (750 x 700 = 525000, negotiated)
(1, 7,  current_date - 110, current_date - 30,   1, 120000, 'Completed'),   -- 3 mandap decoration
(1, 9,  current_date - 100, current_date - 30,   1,  25000, 'Completed'),   -- 4 bridal makeup
(1, 12, current_date - 90,  current_date - 31,   4,  32000, 'Completed'),   -- 5 sangeet DJ, 4 hours (day before)
-- Wedding 2 (Sneha & Rahul) - upcoming
(2, 3,  current_date - 20,  current_date + 45,   1,  70000, 'Confirmed'),   -- 6 candid photography
(2, 6,  current_date - 20,  current_date + 45, 900, 315000, 'Confirmed'),   -- 7 bale ele oota, 900 plates
(2, 11, current_date - 15,  current_date + 45,   1,  18000, 'Pending'),     -- 8 nadaswaram
(2, 13, current_date - 15,  current_date + 44,   1,  12000, 'Confirmed'),   -- 9 bridal mehendi (day before)
-- Wedding 3 (Ananya & Karthik)
(3, 1,  current_date - 5,   current_date + 90,   1,  45000, 'Pending'),     -- 10 silver photography
(3, 15, current_date - 5,   current_date + 90,   1, 200000, 'Cancelled'),   -- 11 planner (cancelled -> date is free again)
-- Wedding 4 (Kavya & Rohan)
(4, 16, current_date - 2,   current_date + 120,  1,  15000, 'Pending');     -- 12 day-of coordination


-- ---------------------------------------------------------------------
-- 9. PAYMENTS  (several payments per booking -> BOOKING 1:N PAYMENT)
--    Only 'Success' payments count towards the amount paid.
-- ---------------------------------------------------------------------
insert into payment (booking_id, payment_date, amount, payment_mode, payment_type, transaction_ref, payment_status) values
(1, current_date - 115,  30000, 'UPI',         'Advance',    'UPI2401001',  'Success'),
(1, current_date - 30,   65000, 'Card',        'Final',      'CARD8823011', 'Success'),   -- booking 1 fully paid
(2, current_date - 115, 150000, 'Net Banking', 'Advance',    'NB55120871',  'Success'),
(2, current_date - 60,  200000, 'Net Banking', 'Instalment', 'NB55120944',  'Success'),
(2, current_date - 29,  150000, 'Cash',        'Final',      null,          'Success'),   -- booking 2 fully paid
(3, current_date - 105,  40000, 'UPI',         'Advance',    'UPI2401077',  'Success'),
(3, current_date - 28,   50000, 'UPI',         'Instalment', 'UPI2401342',  'Success'),   -- booking 3: 30000 still due
(4, current_date - 95,   25000, 'Cash',        'Final',      null,          'Success'),   -- booking 4 fully paid
(5, current_date - 85,   10000, 'UPI',         'Advance',    'UPI2401290',  'Failed'),    -- failed, not counted
(5, current_date - 84,   10000, 'UPI',         'Advance',    'UPI2401291',  'Success'),
(5, current_date - 25,   22000, 'Card',        'Final',      'CARD8823190', 'Success'),   -- booking 5 fully paid
(6, current_date - 18,   20000, 'UPI',         'Advance',    'UPI2409100',  'Success'),
(7, current_date - 18,  100000, 'Net Banking', 'Advance',    'NB66120001',  'Success'),
(7, current_date - 3,    50000, 'UPI',         'Instalment', 'UPI2409876',  'Pending'),   -- pending, not counted yet
(9, current_date - 14,    5000, 'Cash',        'Advance',    null,          'Success');


-- ---------------------------------------------------------------------
-- 10. REVIEWS  (only for COMPLETED bookings; one per booking)
--     Booking 5 is completed but not reviewed yet - Priya can review
--     it during the demo.
-- ---------------------------------------------------------------------
insert into review (booking_id, rating, comments, review_date) values
(1, 5, 'Beautiful candid shots and the wedding film was ready in two weeks.', current_date - 25),
(2, 4, 'Food was delicious, the live dosa counter was a hit. Service a bit slow.', current_date - 26),
(3, 5, 'The flower mandap looked stunning. Everyone asked who decorated it!', current_date - 27),
(4, 5, 'Meera made me feel so relaxed. Makeup lasted the whole day.', current_date - 28);


-- ---------------------------------------------------------------------
-- 11. Quick check - you should see these row counts
-- ---------------------------------------------------------------------
select 'customer' as table_name, count(*) as rows from customer
union all select 'admin',           count(*) from admin
union all select 'venue',           count(*) from venue
union all select 'vendor_category', count(*) from vendor_category
union all select 'vendor',          count(*) from vendor
union all select 'service_package', count(*) from service_package
union all select 'wedding',         count(*) from wedding
union all select 'booking',         count(*) from booking
union all select 'payment',         count(*) from payment
union all select 'review',          count(*) from review;
-- Expected: 3, 1, 6, 7, 12, 19, 4, 12, 15, 4
