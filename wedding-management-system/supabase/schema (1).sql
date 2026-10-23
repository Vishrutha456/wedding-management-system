-- =====================================================================
--  WEDDING MANAGEMENT AND VENDORING SYSTEM
--  Supabase (PostgreSQL) schema
--
--  How to run: Supabase Dashboard -> SQL Editor -> New query ->
--              paste this whole file -> Run.
--  The script is safe to re-run: it drops and recreates everything.
--
--  Sections
--    0. Clean start
--    1. Tables (10 entities from the synopsis) with PK / FK / UNIQUE /
--       CHECK / DEFAULT constraints
--    2. Indexes
--    3. Helper functions (who is logged in?)
--    4. Triggers (auto-create customer, booking rules, payment rules)
--    5. Availability functions
--    6. Views (derived data: totals, balance, ratings)
--    7. Row Level Security (RLS) policies
--    8. Grants
-- =====================================================================


-- =====================================================================
-- 0. CLEAN START (drop in reverse dependency order)
-- =====================================================================
drop trigger  if exists on_auth_user_created on auth.users;
drop view     if exists vendor_reviews, vendor_rating, booking_summary cascade;
drop table    if exists review, payment, booking, service_package, vendor,
                        vendor_category, wedding, venue, admin, customer cascade;
drop function if exists handle_new_user, is_admin, current_customer_id,
                        booking_rules, payment_rules,
                        is_package_available, available_packages,
                        is_venue_available cascade;


-- =====================================================================
-- 1. TABLES
-- =====================================================================

-- ---------------------------------------------------------------------
-- CUSTOMER
-- Passwords are NOT stored here. Supabase Auth keeps the hashed
-- password in auth.users. auth_user_id links this row to that login.
-- ---------------------------------------------------------------------
create table customer (
    customer_id   bigint generated always as identity primary key,
    auth_user_id  uuid not null unique
                  references auth.users(id) on delete cascade,
    full_name     varchar(60)  not null,
    email         varchar(80)  not null unique,
    phone         varchar(15)  not null,
    address       varchar(150),
    created_at    timestamptz  not null default now(),
    constraint chk_customer_phone check (phone ~ '^[0-9+ -]{7,15}$')
);

-- ---------------------------------------------------------------------
-- ADMIN  (also logs in through Supabase Auth)
-- ---------------------------------------------------------------------
create table admin (
    admin_id      bigint generated always as identity primary key,
    auth_user_id  uuid not null unique
                  references auth.users(id) on delete cascade,
    username      varchar(40) not null unique,
    email         varchar(80) not null unique
);

-- ---------------------------------------------------------------------
-- VENUE
-- ---------------------------------------------------------------------
create table venue (
    venue_id       bigint generated always as identity primary key,
    venue_name     varchar(80)   not null,
    address        varchar(150)  not null,
    city           varchar(40)   not null,
    capacity       int           not null check (capacity > 0),
    rent_per_day   numeric(10,2) not null check (rent_per_day >= 0),
    contact_phone  varchar(15)
);

-- ---------------------------------------------------------------------
-- WEDDING   (CUSTOMER 1:N WEDDING, VENUE 1:N WEDDING)
-- ---------------------------------------------------------------------
create table wedding (
    wedding_id    bigint generated always as identity primary key,
    customer_id   bigint not null
                  references customer(customer_id) on delete cascade,
    venue_id      bigint
                  references venue(venue_id) on delete set null,   -- NULL until venue is chosen
    bride_name    varchar(60)   not null,
    groom_name    varchar(60)   not null,
    wedding_date  date          not null,
    guest_count   int           not null check (guest_count > 0),
    budget        numeric(12,2) check (budget >= 0),
    status        varchar(10)   not null default 'Planned'
                  check (status in ('Planned','Confirmed','Completed','Cancelled'))
);

-- ---------------------------------------------------------------------
-- VENDOR_CATEGORY
-- ---------------------------------------------------------------------
create table vendor_category (
    category_id    bigint generated always as identity primary key,
    category_name  varchar(40)  not null unique,
    description    varchar(150)
);

-- ---------------------------------------------------------------------
-- VENDOR   (VENDOR_CATEGORY 1:N VENDOR, ADMIN 1:N VENDOR)
-- verified_by IS NULL  -> vendor not yet verified
-- ---------------------------------------------------------------------
create table vendor (
    vendor_id      bigint generated always as identity primary key,
    category_id    bigint not null
                   references vendor_category(category_id) on delete restrict,
    verified_by    bigint
                   references admin(admin_id) on delete set null,
    business_name  varchar(80) not null,
    owner_name     varchar(60),
    phone          varchar(15) not null,
    email          varchar(80) unique,
    city           varchar(40) not null
);

-- ---------------------------------------------------------------------
-- SERVICE_PACKAGE   (VENDOR 1:N SERVICE_PACKAGE)
-- Deleting a vendor deletes its packages (ON DELETE CASCADE).
-- ---------------------------------------------------------------------
create table service_package (
    package_id    bigint generated always as identity primary key,
    vendor_id     bigint not null
                  references vendor(vendor_id) on delete cascade,
    package_name  varchar(80)   not null,
    description   varchar(200),
    price         numeric(10,2) not null check (price >= 0),
    price_unit    varchar(10)   not null default 'Per Event'
                  check (price_unit in ('Per Event','Per Plate','Per Day','Per Hour')),
    is_active     boolean       not null default true
);

-- ---------------------------------------------------------------------
-- BOOKING  -- associative entity that resolves
--             WEDDING  M:N  SERVICE_PACKAGE
-- NOTE: no vendor_id column. The vendor is found through package_id
--       (booking -> service_package -> vendor). Storing it here would
--       be a transitive dependency and break 3NF.
-- ---------------------------------------------------------------------
create table booking (
    booking_id      bigint generated always as identity primary key,
    wedding_id      bigint not null
                    references wedding(wedding_id) on delete restrict,
    package_id      bigint not null
                    references service_package(package_id) on delete restrict,
    booking_date    date          not null default current_date,
    service_date    date          not null,
    quantity        int           not null default 1 check (quantity > 0),
    agreed_amount   numeric(12,2) not null check (agreed_amount >= 0),
    booking_status  varchar(10)   not null default 'Pending'
                    check (booking_status in ('Pending','Confirmed','Completed','Cancelled')),
    constraint uq_booking unique (wedding_id, package_id, service_date),
    constraint chk_service_after_booking check (service_date >= booking_date)
);

-- ---------------------------------------------------------------------
-- PAYMENT   (BOOKING 1:N PAYMENT)
-- transaction_ref is UNIQUE; PostgreSQL allows many NULLs in a UNIQUE
-- column, so cash payments can leave it empty.
-- ---------------------------------------------------------------------
create table payment (
    payment_id       bigint generated always as identity primary key,
    booking_id       bigint not null
                     references booking(booking_id) on delete restrict,
    payment_date     timestamptz   not null default now(),
    amount           numeric(12,2) not null check (amount > 0),
    payment_mode     varchar(12)   not null
                     check (payment_mode in ('Cash','UPI','Card','Net Banking')),
    payment_type     varchar(10)   not null
                     check (payment_type in ('Advance','Instalment','Final')),
    transaction_ref  varchar(50)   unique,
    payment_status   varchar(8)    not null default 'Success'
                     check (payment_status in ('Success','Pending','Failed')),
    -- every non-cash payment must carry a reference number
    constraint chk_txn_ref check (payment_mode = 'Cash' or transaction_ref is not null)
);

-- ---------------------------------------------------------------------
-- REVIEW   (BOOKING 1:0..1 REVIEW)  UNIQUE(booking_id) = one review per booking
-- ---------------------------------------------------------------------
create table review (
    review_id    bigint generated always as identity primary key,
    booking_id   bigint not null unique
                 references booking(booking_id) on delete cascade,
    rating       smallint not null check (rating between 1 and 5),
    comments     varchar(300),
    review_date  date not null default current_date
);


-- =====================================================================
-- 2. INDEXES
-- PostgreSQL indexes PK and UNIQUE columns automatically, but NOT
-- foreign keys. We index the FKs used in joins and the search columns.
-- =====================================================================
create index idx_wedding_customer   on wedding(customer_id);
create index idx_wedding_venue      on wedding(venue_id);
create index idx_vendor_category    on vendor(category_id);
create index idx_vendor_city        on vendor(city);
create index idx_package_vendor     on service_package(vendor_id);
create index idx_booking_wedding    on booking(wedding_id);
create index idx_payment_booking    on payment(booking_id);
create index idx_venue_city         on venue(city);

-- Availability rule enforced by the database itself:
-- a package can have only ONE non-cancelled booking per service date.
-- (partial unique index: cancelled bookings are ignored)
create unique index uq_package_date_active
    on booking(package_id, service_date)
    where booking_status <> 'Cancelled';

-- A venue can host only ONE non-cancelled wedding per date.
create unique index uq_venue_date_active
    on wedding(venue_id, wedding_date)
    where status <> 'Cancelled' and venue_id is not null;


-- =====================================================================
-- 3. HELPER FUNCTIONS
-- auth.uid() is provided by Supabase: it returns the id (uuid) of the
-- user who is currently logged in.
-- SECURITY DEFINER lets these functions read customer/admin even though
-- those tables are protected by RLS (avoids policy recursion).
-- =====================================================================
create function is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
    select exists (select 1 from admin where auth_user_id = auth.uid());
$$;

create function current_customer_id()
returns bigint
language sql stable security definer set search_path = public
as $$
    select customer_id from customer where auth_user_id = auth.uid();
$$;


-- =====================================================================
-- 4. TRIGGERS
-- =====================================================================

-- 4.1 Registration: when Supabase Auth creates a new user, copy the
--     details sent from the register form into CUSTOMER.
--     Users created by hand in the dashboard (e.g. the admin) have no
--     full_name in their metadata, so no customer row is made for them.
create function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
    if new.raw_user_meta_data ? 'full_name' then
        insert into customer (auth_user_id, full_name, email, phone, address)
        values (new.id,
                new.raw_user_meta_data ->> 'full_name',
                new.email,
                coalesce(new.raw_user_meta_data ->> 'phone', '0000000'),
                new.raw_user_meta_data ->> 'address');
    end if;
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function handle_new_user();


-- 4.2 Booking rules for customers (admins and SQL scripts are not restricted)
--   INSERT: amount = package price x quantity, status starts as Pending,
--           service date must not be in the past.
--   UPDATE: a customer may only change status to 'Cancelled'.
create function booking_rules()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
    v_price numeric;
begin
    -- Admins, and scripts run from the Supabase SQL Editor (no logged-in
    -- user, so auth.uid() is NULL), are trusted and skip these checks.
    if is_admin() or auth.uid() is null then
        return new;
    end if;

    if tg_op = 'INSERT' then
        if new.service_date < current_date then
            raise exception 'Service date cannot be in the past';
        end if;
        select price into v_price from service_package where package_id = new.package_id;
        new.agreed_amount  := v_price * new.quantity;
        new.booking_status := 'Pending';
        new.booking_date   := current_date;
    else  -- UPDATE
        if new.booking_status <> 'Cancelled'
           or new.package_id    <> old.package_id
           or new.wedding_id    <> old.wedding_id
           or new.service_date  <> old.service_date
           or new.quantity      <> old.quantity
           or new.agreed_amount <> old.agreed_amount then
            raise exception 'Customers can only cancel a booking';
        end if;
        if old.booking_status = 'Completed' then
            raise exception 'A completed booking cannot be cancelled';
        end if;
    end if;
    return new;
end;
$$;

create trigger trg_booking_rules
    before insert or update on booking
    for each row execute function booking_rules();


-- 4.3 Payment rule: successful payments may never exceed the agreed
--     amount, and cancelled bookings cannot be paid.
create function payment_rules()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
    v_agreed  numeric;
    v_status  varchar;
    v_paid    numeric;
begin
    select agreed_amount, booking_status into v_agreed, v_status
    from booking where booking_id = new.booking_id;

    if v_status = 'Cancelled' then
        raise exception 'Cannot record a payment for a cancelled booking';
    end if;

    select coalesce(sum(amount), 0) into v_paid
    from payment
    where booking_id = new.booking_id
      and payment_status = 'Success'
      and payment_id <> coalesce(new.payment_id, -1);

    if new.payment_status = 'Success' and v_paid + new.amount > v_agreed then
        raise exception 'Payment exceeds remaining balance (balance is %)', v_agreed - v_paid;
    end if;
    return new;
end;
$$;

create trigger trg_payment_rules
    before insert or update on payment
    for each row execute function payment_rules();


-- =====================================================================
-- 5. AVAILABILITY  (derived from BOOKING - no separate table needed)
-- A package is unavailable on a date if it has a non-cancelled booking
-- on that date. SECURITY DEFINER so a customer can check availability
-- without being able to see other customers' bookings.
-- =====================================================================
create function is_package_available(p_package_id bigint, p_date date)
returns boolean
language sql stable security definer set search_path = public
as $$
    select not exists (
        select 1 from booking
        where package_id = p_package_id
          and service_date = p_date
          and booking_status <> 'Cancelled'
    );
$$;

-- All active packages of verified vendors that are free on a date
create function available_packages(p_date date)
returns table (package_id bigint, package_name varchar, price numeric,
               price_unit varchar, vendor_id bigint, business_name varchar,
               category_name varchar, city varchar)
language sql stable security definer set search_path = public
as $$
    select p.package_id, p.package_name, p.price, p.price_unit,
           v.vendor_id, v.business_name, c.category_name, v.city
    from service_package p
    join vendor v          on v.vendor_id   = p.vendor_id
    join vendor_category c on c.category_id = v.category_id
    where p.is_active
      and v.verified_by is not null
      and not exists (select 1 from booking b
                      where b.package_id = p.package_id
                        and b.service_date = p_date
                        and b.booking_status <> 'Cancelled')
    order by c.category_name, p.price;
$$;

create function is_venue_available(p_venue_id bigint, p_date date)
returns boolean
language sql stable security definer set search_path = public
as $$
    select not exists (
        select 1 from wedding
        where venue_id = p_venue_id
          and wedding_date = p_date
          and status <> 'Cancelled'
    );
$$;


-- =====================================================================
-- 6. VIEWS  (derived values are calculated, never stored)
-- =====================================================================

-- 6.1 Every booking with its vendor, total paid and balance.
--     Balance = agreed_amount - SUM(successful payments)
--     security_invoker = true -> the view obeys the caller's RLS, so a
--     customer only sees rows for their own bookings.
create view booking_summary
with (security_invoker = true) as
select  b.booking_id,
        b.wedding_id,
        w.customer_id,
        w.bride_name || ' & ' || w.groom_name          as couple,
        b.package_id,
        p.package_name,
        p.price_unit,
        v.vendor_id,
        v.business_name,
        c.category_name,
        b.booking_date,
        b.service_date,
        b.quantity,
        b.agreed_amount,
        b.booking_status,
        coalesce(sum(pay.amount) filter (where pay.payment_status = 'Success'), 0) as total_paid,
        b.agreed_amount
          - coalesce(sum(pay.amount) filter (where pay.payment_status = 'Success'), 0) as balance
from booking b
join wedding          w on w.wedding_id  = b.wedding_id
join service_package  p on p.package_id  = b.package_id
join vendor           v on v.vendor_id   = p.vendor_id
join vendor_category  c on c.category_id = v.category_id
left join payment   pay on pay.booking_id = b.booking_id
group by b.booking_id, w.wedding_id, p.package_id, v.vendor_id, c.category_id;

-- 6.2 Average rating per vendor (public, aggregate only).
--     Runs with owner rights so everyone can see ratings, but it only
--     exposes counts and averages - no customer data.
create view vendor_rating as
select  v.vendor_id,
        v.business_name,
        count(r.review_id)               as review_count,
        round(avg(r.rating)::numeric, 1) as avg_rating
from vendor v
left join service_package p on p.vendor_id  = v.vendor_id
left join booking         b on b.package_id = p.package_id
left join review          r on r.booking_id = b.booking_id
where v.verified_by is not null
group by v.vendor_id, v.business_name;

-- 6.3 Individual reviews of a vendor (no customer names exposed)
create view vendor_reviews as
select  p.vendor_id,
        p.package_name,
        r.rating,
        r.comments,
        r.review_date
from review r
join booking         b on b.booking_id = r.booking_id
join service_package p on p.package_id = b.package_id;


-- =====================================================================
-- 7. ROW LEVEL SECURITY
-- Once RLS is enabled, NOTHING is visible unless a policy allows it.
-- =====================================================================
alter table customer        enable row level security;
alter table admin           enable row level security;
alter table venue           enable row level security;
alter table wedding         enable row level security;
alter table vendor_category enable row level security;
alter table vendor          enable row level security;
alter table service_package enable row level security;
alter table booking         enable row level security;
alter table payment         enable row level security;
alter table review          enable row level security;

-- CUSTOMER: see/edit only your own profile; admin sees all
create policy customer_select on customer for select
    using (auth_user_id = auth.uid() or is_admin());
create policy customer_update on customer for update
    using (auth_user_id = auth.uid())
    with check (auth_user_id = auth.uid());
create policy customer_admin_all on customer for all
    using (is_admin()) with check (is_admin());

-- ADMIN: an admin can read the admin table (customers cannot)
create policy admin_select on admin for select
    using (is_admin());

-- CATALOGUE (venue, category, vendor, package): anyone may read,
-- only admin may insert / update / delete.
create policy venue_read  on venue for select using (true);
create policy venue_admin on venue for all using (is_admin()) with check (is_admin());

create policy category_read  on vendor_category for select using (true);
create policy category_admin on vendor_category for all using (is_admin()) with check (is_admin());

-- unverified vendors are hidden from everyone except admin
create policy vendor_read  on vendor for select
    using (verified_by is not null or is_admin());
create policy vendor_admin on vendor for all using (is_admin()) with check (is_admin());

create policy package_read  on service_package for select using (true);
create policy package_admin on service_package for all using (is_admin()) with check (is_admin());

-- WEDDING: a customer manages only their own weddings
create policy wedding_select on wedding for select
    using (customer_id = current_customer_id() or is_admin());
create policy wedding_insert on wedding for insert
    with check (customer_id = current_customer_id());
create policy wedding_update on wedding for update
    using (customer_id = current_customer_id())
    with check (customer_id = current_customer_id());
create policy wedding_delete on wedding for delete
    using (customer_id = current_customer_id());
create policy wedding_admin on wedding for all
    using (is_admin()) with check (is_admin());

-- BOOKING: only for your own weddings, only active packages of verified vendors
create policy booking_select on booking for select
    using (is_admin() or wedding_id in
           (select wedding_id from wedding where customer_id = current_customer_id()));
create policy booking_insert on booking for insert
    with check (
        wedding_id in (select wedding_id from wedding where customer_id = current_customer_id())
        and package_id in (select p.package_id
                           from service_package p join vendor v on v.vendor_id = p.vendor_id
                           where p.is_active and v.verified_by is not null));
create policy booking_update on booking for update      -- (trigger allows only cancel)
    using (wedding_id in
           (select wedding_id from wedding where customer_id = current_customer_id()));
create policy booking_admin on booking for all
    using (is_admin()) with check (is_admin());

-- PAYMENT: view and record payments for your own bookings only
create policy payment_select on payment for select
    using (is_admin() or booking_id in
           (select b.booking_id from booking b join wedding w on w.wedding_id = b.wedding_id
            where w.customer_id = current_customer_id()));
create policy payment_insert on payment for insert
    with check (booking_id in
           (select b.booking_id from booking b join wedding w on w.wedding_id = b.wedding_id
            where w.customer_id = current_customer_id()));
create policy payment_admin on payment for all
    using (is_admin()) with check (is_admin());

-- REVIEW: review only your own COMPLETED bookings
create policy review_select on review for select
    using (is_admin() or booking_id in
           (select b.booking_id from booking b join wedding w on w.wedding_id = b.wedding_id
            where w.customer_id = current_customer_id()));
create policy review_insert on review for insert
    with check (booking_id in
           (select b.booking_id from booking b join wedding w on w.wedding_id = b.wedding_id
            where w.customer_id = current_customer_id()
              and b.booking_status = 'Completed'));
create policy review_update on review for update
    using (booking_id in
           (select b.booking_id from booking b join wedding w on w.wedding_id = b.wedding_id
            where w.customer_id = current_customer_id()));
create policy review_delete on review for delete
    using (booking_id in
           (select b.booking_id from booking b join wedding w on w.wedding_id = b.wedding_id
            where w.customer_id = current_customer_id()));
create policy review_admin on review for all
    using (is_admin()) with check (is_admin());


-- =====================================================================
-- 8. GRANTS
-- anon = visitor who is not logged in, authenticated = logged-in user.
-- Grants say WHICH operations a role may attempt; RLS then decides
-- WHICH ROWS. Visitors may only browse the catalogue.
-- =====================================================================
revoke all on all tables in schema public from anon, authenticated;

grant select on venue, vendor_category, vendor, service_package,
                vendor_rating, vendor_reviews
      to anon, authenticated;

grant select, insert, update, delete
      on customer, admin, venue, wedding, vendor_category, vendor,
         service_package, booking, payment, review
      to authenticated;
grant select on booking_summary to authenticated;

grant execute on function is_package_available(bigint, date),
                          available_packages(date),
                          is_venue_available(bigint, date)
      to anon, authenticated;
grant execute on function is_admin(), current_customer_id() to anon, authenticated;

-- End of schema.sql
