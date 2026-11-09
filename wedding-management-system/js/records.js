// =====================================================================
// js/records.js  -  the records page (event.html?e=<event key>)
//
// 1. Finds which timeline event was clicked (from the URL).
// 2. Makes sure someone is signed in (Supabase Auth).
// 3. Loads that event's rows from Supabase and shows them in a table.
// 4. Search, Add, Edit, Delete (+ Payments for bookings).
//
// Row Level Security in the database decides what each user may see
// and change: an admin sees everything, a customer only their own data.
// =====================================================================

const params   = new URLSearchParams(location.search);
const eventKey = params.get('e');
const EVENT    = EVENTS.find(ev => ev.key === eventKey) || ADMIN_PAGES.find(ev => ev.key === eventKey);

// Ceremonies that show BOOKINGS also get tabs for that ceremony's
// vendors, packages and reviews (same vendor categories).
const TABS = [
    { key: 'bookings', label: 'Bookings', spec: 'booking' },
    { key: 'vendors',  label: 'Vendors',  spec: 'vendor'  },
    { key: 'packages', label: 'Packages', spec: 'package' },
    { key: 'reviews',  label: 'Reviews',  spec: 'review'  },
];
const HAS_TABS = EVENT && EVENT.source.entity === 'booking';
const TAB = HAS_TABS ? (TABS.find(t => t.key === params.get('tab')) || TABS[0]) : null;

let ROLE = null;        // 'admin' or 'customer'
let ME = null;          // the CUSTOMER row of a signed-in customer
let ADMIN_ID = null;    // admin_id of a signed-in admin (used when verifying vendors)
let SPEC = null;        // how to load/show/save the current table (see SPECS below)
let ROWS = [];          // rows loaded from the database
let SEARCH = (params.get('q') || '').toLowerCase();   // current search text
let CHECK_DATE = '';    // Packages tab: date chosen for the availability check

const isAdmin = () => ROLE === 'admin';


// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

// For UPDATE / DELETE we add .select() so Supabase returns the changed rows.
// If RLS blocked the change, no error is raised but 0 rows come back.
function checkChanged(result) {
    if (result.error) return result.error;
    if (!result.data || result.data.length === 0) {
        return { message: 'You are not allowed to change this record.' };
    }
    return null;
}

// Turn database errors into readable sentences
function niceError(error) {
    if (!error) return '';
    if (error.code === '23503') {   // foreign key violation
        return 'This record is linked to other records (for example bookings or payments), so it cannot be deleted. Cancel it instead.';
    }
    const text = friendlyError(error);
    if (text === error.message && /duplicate key/i.test(text)) {
        return 'A record with this value already exists - it must be unique.';
    }
    return text;
}

function stars(n) {
    const k = Math.round(Number(n) || 0);
    return `<span class="stars">${'★'.repeat(k)}<span class="off">${'★'.repeat(5 - k)}</span></span>`;
}

function statusTag(s) { return `<span class="status ${esc(s)}">${esc(s)}</span>`; }

function option(value, label, selected) {
    return `<option value="${esc(value)}" ${String(selected) === String(value) ? 'selected' : ''}>${esc(label)}</option>`;
}

// numbers from forms arrive as text: '' -> null, '12' -> 12
const toNumber = v => (v === '' || v === null || v === undefined) ? null : Number(v);


// ---------------------------------------------------------------------
// Option lists for drop-downs (all read from the database)
// ---------------------------------------------------------------------

async function weddingOptions() {
    const { data, error } = await db.from('wedding')
        .select('wedding_id, bride_name, groom_name, wedding_date, status')
        .neq('status', 'Cancelled').order('wedding_date');
    if (error) throw error;
    return data.map(w => ({ value: w.wedding_id,
        label: `#${w.wedding_id}  ${w.bride_name} & ${w.groom_name}  (${formatDate(w.wedding_date)})` }));
}

// active packages of verified vendors in the given categories
// (embedded select = JOIN service_package -> vendor -> vendor_category)
async function packageRows(categories) {
    const { data, error } = await db.from('service_package')
        .select('package_id, package_name, price, price_unit, vendor!inner(business_name, vendor_category!inner(category_name))')
        .eq('is_active', true)
        .order('price');
    if (error) throw error;
    return data.filter(p => categories.includes(p.vendor.vendor_category.category_name));
}

async function venueOptions() {
    const { data, error } = await db.from('venue').select('venue_id, venue_name, city, capacity').order('venue_name');
    if (error) throw error;
    return data;
}

async function customerOptions() {
    const { data, error } = await db.from('customer').select('customer_id, full_name, email').order('full_name');
    if (error) throw error;
    return data.map(c => ({ value: c.customer_id, label: `${c.full_name} (${c.email})` }));
}


// =====================================================================
// SPECS: one entry per kind of record.
//   load()            -> rows from Supabase
//   columns           -> table columns
//   canAdd / addNote  -> whether "Add record" is allowed
//   form(row)         -> form fields (row = null when adding)
//   save(values, row) -> INSERT or UPDATE, returns an error or null
//   canEdit / canDelete / remove / extraActions
// =====================================================================

const SPECS = {

    // -----------------------------------------------------------------
    // BOOKING  (filtered by vendor category) - uses the booking_summary
    // VIEW so that total_paid and balance are calculated by SQL
    // -----------------------------------------------------------------
    booking: {
        tableName: 'booking table',
        searchHint: 'Search by couple, vendor, package or status',
        key: r => r.booking_id,

        async load() {
            const { data, error } = await db.from('booking_summary')
                .select('*')
                .in('category_name', EVENT.source.categories)
                .order('service_date');
            if (error) throw error;
            return data;
        },

        columns: [
            { label: 'No.',             html: r => `#${r.booking_id}` },
            { label: 'Couple',          html: r => `${esc(r.couple)}<span class="sub">Wedding #${r.wedding_id}</span>` },
            { label: 'Vendor &amp; Package', html: r => `${esc(r.business_name)}<span class="sub">${esc(r.package_name)} &middot; ${esc(r.category_name)}</span>` },
            { label: 'Service date',    html: r => formatDate(r.service_date) },
            { label: 'Qty',             html: r => `${r.quantity}<span class="sub">${esc(r.price_unit)}</span>`, cls: 'num' },
            { label: 'Amount',          html: r => rupees(r.agreed_amount, 0), cls: 'num' },
            { label: 'Paid',            html: r => rupees(r.total_paid, 0), cls: 'num' },
            { label: 'Balance',         html: r => r.booking_status === 'Cancelled' ? '&mdash;' : rupees(r.balance, 0), cls: 'num' },
            { label: 'Status',          html: r => statusTag(r.booking_status) },
        ],

        canAdd: () => true,
        canEdit: () => isAdmin(),
        canDelete: () => isAdmin(),

        extraActions(r) {
            const list = [{ label: 'Payments', run: () => openPayments(r) }];
            if (!isAdmin() && !['Cancelled', 'Completed'].includes(r.booking_status)) {
                list.push({ label: 'Cancel', danger: true, run: () => cancelBooking(r) });
            }
            return list;
        },

        async form(r, defaults = {}) {
            if (r) {   // EDIT (admin only)
                return [
                    { name: 'service_date', label: 'Service date', type: 'date', value: r.service_date, required: true },
                    { name: 'quantity', label: `Quantity (${r.price_unit})`, type: 'number', min: 1, value: r.quantity, required: true },
                    { name: 'agreed_amount', label: 'Agreed amount (₹)', type: 'number', min: 0, step: '0.01', value: r.agreed_amount, required: true },
                    { name: 'booking_status', label: 'Status', type: 'select', value: r.booking_status,
                      options: ['Pending', 'Confirmed', 'Completed', 'Cancelled'].map(s => ({ value: s, label: s })) },
                ];
            }
            // ADD
            const weddings = await weddingOptions();
            this.packages = await packageRows(EVENT.source.categories);
            const fields = [
                { name: 'wedding_id', label: 'Wedding', type: 'select', required: true, options: weddings,
                  emptyText: weddings.length ? 'Choose a wedding' : 'No weddings yet - add one under Ceremony' },
                { name: 'package_id', label: 'Vendor package', type: 'select', required: true, value: defaults.package_id,
                  options: this.packages.map(p => ({ value: p.package_id,
                      label: `${p.vendor.business_name} - ${p.package_name} (${rupees(p.price, 0)} ${p.price_unit.toLowerCase()})` })),
                  emptyText: this.packages.length ? 'Choose a package' : 'No packages available' },
                { name: 'service_date', label: 'Service date', type: 'date', required: true, min: isAdmin() ? null : todayISO(),
                  value: defaults.service_date },
                { name: 'quantity', label: 'Quantity', type: 'number', min: 1, value: 1, required: true,
                  hint: 'Plates, hours or days, depending on the package' },
            ];
            if (isAdmin()) {
                fields.push({ name: 'agreed_amount', label: 'Agreed amount (₹)', type: 'number', min: 0, step: '0.01',
                              hint: 'Leave empty to use price × quantity' });
                fields.push({ name: 'booking_status', label: 'Status', type: 'select', value: 'Pending',
                              options: ['Pending', 'Confirmed', 'Completed'].map(s => ({ value: s, label: s })) });
            }
            return fields;
        },

        async save(v, r) {
            if (r) {
                const res = await db.from('booking').update({
                    service_date: v.service_date,
                    quantity: toNumber(v.quantity),
                    agreed_amount: toNumber(v.agreed_amount),
                    booking_status: v.booking_status,
                }).eq('booking_id', r.booking_id).select();
                return checkChanged(res);
            }

            // Availability check: SQL function is_package_available() looks for a
            // non-cancelled booking of this package on this date
            const { data: free, error: availErr } = await db.rpc('is_package_available',
                { p_package_id: Number(v.package_id), p_date: v.service_date });
            if (availErr) return availErr;
            if (!free) return { message: 'This package is already booked on that date. Please choose another date or package.' };

            const pkg = this.packages.find(p => String(p.package_id) === String(v.package_id));
            const qty = toNumber(v.quantity);
            const amount = toNumber(v.agreed_amount) ?? pkg.price * qty;   // customers: trigger sets price x qty

            const { error } = await db.from('booking').insert({
                wedding_id: Number(v.wedding_id),
                package_id: Number(v.package_id),
                service_date: v.service_date,
                quantity: qty,
                agreed_amount: amount,
                booking_status: v.booking_status || 'Pending',
            });
            return error;
        },

        async remove(r) {
            return checkChanged(await db.from('booking').delete().eq('booking_id', r.booking_id).select());
        },
    },

    // -----------------------------------------------------------------
    // WEDDING
    // -----------------------------------------------------------------
    wedding: {
        tableName: 'wedding table',
        searchHint: 'Search by couple, client, venue or status',
        key: r => r.wedding_id,

        async load() {
            // JOINs: wedding -> customer, wedding -> venue
            const { data, error } = await db.from('wedding')
                .select('*, customer(full_name, email), venue(venue_name, city, capacity)')
                .order('wedding_date');
            if (error) throw error;
            return data;
        },

        columns: [
            { label: 'No.',     html: r => `#${r.wedding_id}` },
            { label: 'Couple',  html: r => `${esc(r.bride_name)} &amp; ${esc(r.groom_name)}<span class="sub">${esc(r.customer?.full_name || '')}</span>` },
            { label: 'Date',    html: r => formatDate(r.wedding_date) },
            { label: 'Venue',   html: r => r.venue ? `${esc(r.venue.venue_name)}<span class="sub">${esc(r.venue.city)}</span>` : '<span class="sub">Not chosen</span>' },
            { label: 'Guests',  html: r => r.guest_count, cls: 'num' },
            { label: 'Budget',  html: r => r.budget === null ? '&mdash;' : rupees(r.budget, 0), cls: 'num' },
            { label: 'Status',  html: r => statusTag(r.status) },
        ],

        canAdd: () => true,
        canEdit: () => true,
        canDelete: () => true,

        async form(r) {
            const venues = await venueOptions();
            this.venues = venues;
            const fields = [];
            if (isAdmin()) {
                fields.push({ name: 'customer_id', label: 'Client (customer)', type: 'select', required: true,
                              value: r?.customer_id, options: await customerOptions(), emptyText: 'Choose a client' });
            }
            fields.push(
                { name: 'bride_name', label: 'Bride', type: 'text', maxlength: 60, required: true, value: r?.bride_name, half: true },
                { name: 'groom_name', label: 'Groom', type: 'text', maxlength: 60, required: true, value: r?.groom_name, half: true },
                { name: 'wedding_date', label: 'Wedding date', type: 'date', required: true, value: r?.wedding_date,
                  min: (!r && !isAdmin()) ? todayISO() : null, half: true },
                { name: 'guest_count', label: 'Guests', type: 'number', min: 1, required: true, value: r?.guest_count, half: true },
                { name: 'budget', label: 'Budget (₹)', type: 'number', min: 0, step: '0.01', value: r?.budget, half: true },
                { name: 'status', label: 'Status', type: 'select', value: r?.status || 'Planned', half: true,
                  options: ['Planned', 'Confirmed', 'Completed', 'Cancelled'].map(s => ({ value: s, label: s })) },
                { name: 'venue_id', label: 'Venue', type: 'select', value: r?.venue_id, emptyText: 'Not chosen yet',
                  options: venues.map(v => ({ value: v.venue_id, label: `${v.venue_name}, ${v.city} (up to ${v.capacity} guests)` })),
                  hint: 'A venue can host only one wedding per date.' },
            );
            return fields;
        },

        async save(v, r) {
            // business rule checked before saving: guests must fit in the venue
            const venue = this.venues.find(x => String(x.venue_id) === String(v.venue_id));
            if (venue && Number(v.guest_count) > venue.capacity) {
                return { message: `${venue.venue_name} holds up to ${venue.capacity} guests. Reduce the guest count or choose a larger venue.` };
            }
            const row = {
                bride_name: v.bride_name.trim(),
                groom_name: v.groom_name.trim(),
                wedding_date: v.wedding_date,
                guest_count: toNumber(v.guest_count),
                budget: toNumber(v.budget),
                status: v.status,
                venue_id: toNumber(v.venue_id),
            };
            row.customer_id = isAdmin() ? toNumber(v.customer_id) : (r ? r.customer_id : ME.customer_id);

            if (r) return checkChanged(await db.from('wedding').update(row).eq('wedding_id', r.wedding_id).select());
            const { error } = await db.from('wedding').insert(row);
            return error;
        },

        async remove(r) {
            return checkChanged(await db.from('wedding').delete().eq('wedding_id', r.wedding_id).select());
        },
    },

    // -----------------------------------------------------------------
    // VENUE  (everyone can read, only admin can change)
    // -----------------------------------------------------------------
    venue: {
        tableName: 'venue table',
        searchHint: 'Search by venue name or city',
        key: r => r.venue_id,

        async load() {
            const { data, error } = await db.from('venue').select('*').order('city').order('venue_name');
            if (error) throw error;
            return data;
        },

        columns: [
            { label: 'No.',        html: r => `#${r.venue_id}` },
            { label: 'Venue',      html: r => `${esc(r.venue_name)}<span class="sub">${esc(r.address)}</span>` },
            { label: 'City',       html: r => esc(r.city) },
            { label: 'Capacity',   html: r => r.capacity, cls: 'num' },
            { label: 'Rent / day', html: r => rupees(r.rent_per_day, 0), cls: 'num' },
            { label: 'Contact',    html: r => esc(r.contact_phone || '—') },
        ],

        canAdd: () => isAdmin(),
        addNote: 'Only administrators can add or change venues.',
        canEdit: () => isAdmin(),
        canDelete: () => isAdmin(),

        async form(r) {
            return [
                { name: 'venue_name', label: 'Venue name', type: 'text', maxlength: 80, required: true, value: r?.venue_name },
                { name: 'address', label: 'Address', type: 'text', maxlength: 150, required: true, value: r?.address },
                { name: 'city', label: 'City', type: 'text', maxlength: 40, required: true, value: r?.city, half: true },
                { name: 'contact_phone', label: 'Contact phone', type: 'tel', maxlength: 15, value: r?.contact_phone, half: true },
                { name: 'capacity', label: 'Capacity (guests)', type: 'number', min: 1, required: true, value: r?.capacity, half: true },
                { name: 'rent_per_day', label: 'Rent per day (₹)', type: 'number', min: 0, step: '0.01', required: true, value: r?.rent_per_day, half: true },
            ];
        },

        async save(v, r) {
            const row = {
                venue_name: v.venue_name.trim(), address: v.address.trim(), city: v.city.trim(),
                contact_phone: v.contact_phone.trim() || null,
                capacity: toNumber(v.capacity), rent_per_day: toNumber(v.rent_per_day),
            };
            if (r) return checkChanged(await db.from('venue').update(row).eq('venue_id', r.venue_id).select());
            const { error } = await db.from('venue').insert(row);
            return error;
        },

        async remove(r) {
            return checkChanged(await db.from('venue').delete().eq('venue_id', r.venue_id).select());
        },
    },

    // -----------------------------------------------------------------
    // CUSTOMER  (the couples / clients)
    // New customers are created by registering: Supabase Auth makes the
    // login and the handle_new_user() trigger inserts the customer row.
    // -----------------------------------------------------------------
    customer: {
        tableName: 'customer table',
        searchHint: 'Search by name, email, phone or address',
        key: r => r.customer_id,

        async load() {
            // wedding(count) = COUNT of each customer's weddings (an aggregate through the FK)
            const { data, error } = await db.from('customer')
                .select('*, wedding(count)')
                .order('created_at');
            if (error) throw error;
            return data;
        },

        columns: [
            { label: 'No.',      html: r => `#${r.customer_id}` },
            { label: 'Name',     html: r => esc(r.full_name) },
            { label: 'Email',    html: r => esc(r.email) },
            { label: 'Phone',    html: r => esc(r.phone) },
            { label: 'Address',  html: r => esc(r.address || '—') },
            { label: 'Weddings', html: r => r.wedding?.[0]?.count ?? 0, cls: 'num' },
            { label: 'Joined',   html: r => formatDate(r.created_at) },
        ],

        canAdd: () => false,
        addNote: 'New couples join by <a href="register.html">registering</a>: Supabase Auth creates their login and a database trigger adds their customer record.',
        canEdit: () => true,
        canDelete: () => isAdmin(),

        async form(r) {
            return [
                { name: 'full_name', label: 'Full name', type: 'text', maxlength: 60, required: true, value: r.full_name },
                { name: 'phone', label: 'Phone', type: 'tel', maxlength: 15, required: true, value: r.phone,
                  pattern: '[0-9+ \\-]{7,15}', hint: `Email (${r.email}) is the login and cannot be changed here.` },
                { name: 'address', label: 'Address', type: 'text', maxlength: 150, value: r.address },
            ];
        },

        async save(v, r) {
            return checkChanged(await db.from('customer').update({
                full_name: v.full_name.trim(), phone: v.phone.trim(), address: v.address.trim() || null,
            }).eq('customer_id', r.customer_id).select());
        },

        async remove(r) {
            return checkChanged(await db.from('customer').delete().eq('customer_id', r.customer_id).select());
        },
    },

    // -----------------------------------------------------------------
    // VENDOR  (vendors in this ceremony's categories)
    // Customers only see VERIFIED vendors (RLS policy vendor_read).
    // -----------------------------------------------------------------
    vendor: {
        title: 'Vendors',
        tableName: 'vendor table',
        searchHint: 'Search by vendor, owner, city or phone',
        key: r => r.vendor_id,

        async load() {
            // vendor JOIN vendor_category, plus COUNT of each vendor's packages
            const [vendors, ratings] = await Promise.all([
                db.from('vendor')
                  .select('*, vendor_category!inner(category_name), service_package(count)')
                  .order('business_name'),
                db.from('vendor_rating').select('vendor_id, avg_rating, review_count'),
            ]);
            if (vendors.error) throw vendors.error;
            const rating = Object.fromEntries((ratings.data || []).map(x => [x.vendor_id, x]));
            return vendors.data
                .filter(v => EVENT.source.categories.includes(v.vendor_category.category_name))
                .map(v => ({ ...v, rating: rating[v.vendor_id] }));
        },

        columns: [
            { label: 'Vendor',   html: r => `${esc(r.business_name)}<span class="sub">${esc(r.owner_name || '')}</span>` },
            { label: 'Category', html: r => esc(r.vendor_category.category_name) },
            { label: 'City',     html: r => esc(r.city) },
            { label: 'Contact',  html: r => `${esc(r.phone)}<span class="sub">${esc(r.email || '')}</span>` },
            { label: 'Packages', html: r => r.service_package?.[0]?.count ?? 0, cls: 'num' },
            { label: 'Rating',   html: r => r.rating && r.rating.review_count
                                    ? `${stars(r.rating.avg_rating)} ${r.rating.avg_rating}<span class="sub">${r.rating.review_count} review${r.rating.review_count > 1 ? 's' : ''}</span>`
                                    : '<span class="sub">No reviews</span>' },
            { label: 'Status',   html: r => statusTag(r.verified_by ? 'Verified' : 'Pending') },
        ],

        canAdd: () => isAdmin(),
        addNote: 'Only verified vendors are listed. Open a vendor’s packages to book.',
        canEdit: () => isAdmin(),
        canDelete: () => isAdmin(),

        extraActions(r) {
            return [{ label: 'Packages', run: () => {
                location.href = `event.html?e=${EVENT.key}&tab=packages&q=${encodeURIComponent(r.business_name)}`;
            } }];
        },

        async form(r) {
            const { data: cats, error } = await db.from('vendor_category')
                .select('category_id, category_name').order('category_name');
            if (error) throw error;
            const preferred = cats.find(c => EVENT.source.categories.includes(c.category_name));
            return [
                { name: 'business_name', label: 'Business name', type: 'text', maxlength: 80, required: true, value: r?.business_name },
                { name: 'owner_name', label: 'Owner name', type: 'text', maxlength: 60, value: r?.owner_name, half: true },
                { name: 'category_id', label: 'Category', type: 'select', required: true, half: true,
                  value: r?.category_id ?? preferred?.category_id,
                  options: cats.map(c => ({ value: c.category_id, label: c.category_name })) },
                { name: 'phone', label: 'Phone', type: 'tel', maxlength: 15, required: true, value: r?.phone, half: true,
                  pattern: '[0-9+ \\-]{7,15}' },
                { name: 'email', label: 'Email', type: 'email', maxlength: 80, value: r?.email, half: true },
                { name: 'city', label: 'City', type: 'text', maxlength: 40, required: true, value: r?.city, half: true },
                { name: 'verified', label: 'Verified by admin?', type: 'select', required: true, half: true,
                  value: r ? (r.verified_by ? 'yes' : 'no') : 'yes',
                  options: [{ value: 'yes', label: 'Yes - visible to customers' }, { value: 'no', label: 'No - hidden from customers' }] },
            ];
        },

        async save(v, r) {
            const row = {
                business_name: v.business_name.trim(),
                owner_name: v.owner_name.trim() || null,
                category_id: Number(v.category_id),
                phone: v.phone.trim(),
                email: v.email.trim() || null,
                city: v.city.trim(),
                // verified_by = the admin who verified it, NULL = not verified
                verified_by: v.verified === 'yes' ? (r?.verified_by ?? ADMIN_ID) : null,
            };
            if (r) return checkChanged(await db.from('vendor').update(row).eq('vendor_id', r.vendor_id).select());
            const { error } = await db.from('vendor').insert(row);
            return error;
        },

        async remove(r) {
            // ON DELETE CASCADE removes its packages; bookings prevent deletion (RESTRICT)
            return checkChanged(await db.from('vendor').delete().eq('vendor_id', r.vendor_id).select());
        },
    },

    // -----------------------------------------------------------------
    // SERVICE_PACKAGE  (+ availability check for a chosen date)
    // -----------------------------------------------------------------
    package: {
        title: 'Service Packages',
        tableName: 'service_package table',
        searchHint: 'Search by package, vendor or city',
        key: r => r.package_id,

        // date box shown next to the search field
        toolbarExtra: () => `
            <label class="date-check">Check date
                <input type="date" id="checkDate" min="${todayISO()}" value="${CHECK_DATE}">
            </label>`,
        afterShell() {
            document.getElementById('checkDate').onchange = (e) => { CHECK_DATE = e.target.value; loadRows(); };
        },

        async load() {
            const { data, error } = await db.from('service_package')
                .select('*, vendor!inner(vendor_id, business_name, city, verified_by, vendor_category!inner(category_name))')
                .order('price');
            if (error) throw error;
            let rows = data.filter(p => EVENT.source.categories.includes(p.vendor.vendor_category.category_name));
            if (!isAdmin()) rows = rows.filter(p => p.is_active);

            // Availability = SQL function available_packages(date):
            // active packages with NO non-cancelled booking on that date
            this.free = null;
            if (CHECK_DATE) {
                const { data: free, error: fErr } = await db.rpc('available_packages', { p_date: CHECK_DATE });
                if (fErr) throw fErr;
                this.free = new Set(free.map(f => f.package_id));
            }
            return rows;
        },

        columns: [
            { label: 'Package', html: r => `${esc(r.package_name)}<span class="sub">${esc(r.description || '')}</span>` },
            { label: 'Vendor',  html: r => `${esc(r.vendor.business_name)}<span class="sub">${esc(r.vendor.city)}</span>` },
            { label: 'Price',   html: r => `${rupees(r.price, 0)}<span class="sub">${esc(r.price_unit.toLowerCase())}</span>`, cls: 'num' },
            { label: 'Status',  html: r => {
                if (!r.is_active) return statusTag('Not offered');
                if (r.vendor.verified_by === null) return statusTag('Unverified');   // only admins see these
                if (SPECS.package.free) {
                    return SPECS.package.free.has(r.package_id)
                        ? statusTag('Available') + `<span class="sub">on ${formatDate(CHECK_DATE)}</span>`
                        : statusTag('Booked') + `<span class="sub">on ${formatDate(CHECK_DATE)}</span>`;
                }
                return statusTag('Offered');
            } },
        ],

        canAdd: () => isAdmin(),
        addNote: 'Pick a date to check availability, then press “Book”.',
        canEdit: () => isAdmin(),
        canDelete: () => isAdmin(),

        extraActions(r) {
            if (!r.is_active || r.vendor.verified_by === null) return [];
            if (SPECS.package.free && !SPECS.package.free.has(r.package_id)) return [];   // already booked that day
            return [{ label: 'Book', run: () =>
                openForm(null, { package_id: r.package_id, service_date: CHECK_DATE }, SPECS.booking) }];
        },

        async form(r) {
            const { data, error } = await db.from('vendor')
                .select('vendor_id, business_name, vendor_category!inner(category_name)').order('business_name');
            if (error) throw error;
            const vendors = data.filter(v => EVENT.source.categories.includes(v.vendor_category.category_name));
            return [
                { name: 'vendor_id', label: 'Vendor', type: 'select', required: true, value: r?.vendor_id,
                  options: vendors.map(v => ({ value: v.vendor_id, label: v.business_name })), emptyText: 'Choose a vendor' },
                { name: 'package_name', label: 'Package name', type: 'text', maxlength: 80, required: true, value: r?.package_name },
                { name: 'description', label: 'Description', type: 'textarea', maxlength: 200, value: r?.description },
                { name: 'price', label: 'Price (₹)', type: 'number', min: 0, step: '0.01', required: true, value: r?.price, half: true },
                { name: 'price_unit', label: 'Price unit', type: 'select', required: true, half: true, value: r?.price_unit || 'Per Event',
                  options: ['Per Event', 'Per Plate', 'Per Day', 'Per Hour'].map(u => ({ value: u, label: u })) },
                { name: 'is_active', label: 'Offered to customers?', type: 'select', required: true,
                  value: r ? (r.is_active ? 'true' : 'false') : 'true',
                  options: [{ value: 'true', label: 'Yes - active' }, { value: 'false', label: 'No - hidden' }] },
            ];
        },

        async save(v, r) {
            const row = {
                vendor_id: Number(v.vendor_id),
                package_name: v.package_name.trim(),
                description: v.description.trim() || null,
                price: toNumber(v.price),
                price_unit: v.price_unit,
                is_active: v.is_active === 'true',
            };
            if (r) return checkChanged(await db.from('service_package').update(row).eq('package_id', r.package_id).select());
            const { error } = await db.from('service_package').insert(row);
            return error;
        },

        async remove(r) {
            return checkChanged(await db.from('service_package').delete().eq('package_id', r.package_id).select());
        },
    },

    // -----------------------------------------------------------------
    // REVIEW  (public reviews from the vendor_reviews VIEW)
    // A customer can review their own COMPLETED bookings, once each.
    // -----------------------------------------------------------------
    review: {
        title: 'Reviews & Ratings',
        tableName: 'review table',
        searchHint: 'Search by vendor, package or comment',
        key: (r, i) => `${r.vendor_id}-${r.review_date}-${r.package_name}`,

        async load() {
            const [vendors, reviews] = await Promise.all([
                db.from('vendor').select('vendor_id, business_name, vendor_category!inner(category_name)'),
                db.from('vendor_reviews').select('*').order('review_date', { ascending: false }),
            ]);
            if (vendors.error) throw vendors.error;
            if (reviews.error) throw reviews.error;
            const names = Object.fromEntries(vendors.data
                .filter(v => EVENT.source.categories.includes(v.vendor_category.category_name))
                .map(v => [v.vendor_id, v.business_name]));
            return reviews.data
                .filter(r => names[r.vendor_id])
                .map(r => ({ ...r, business_name: names[r.vendor_id] }));
        },

        columns: [
            { label: 'Vendor',   html: r => `${esc(r.business_name)}<span class="sub">${esc(r.package_name)}</span>` },
            { label: 'Rating',   html: r => `${stars(r.rating)}<span class="sub">${r.rating} / 5</span>` },
            { label: 'Comments', html: r => r.comments ? `<em>“${esc(r.comments)}”</em>` : '<span class="sub">—</span>' },
            { label: 'Date',     html: r => formatDate(r.review_date) },
        ],

        canAdd: () => !isAdmin(),
        addNote: 'Reviews are written by couples after a completed booking.',
        canEdit: () => false,
        canDelete: () => false,

        async form() {
            // my completed bookings in these categories that I have not reviewed yet
            const [bks, mine] = await Promise.all([
                db.from('booking_summary').select('*')
                  .in('category_name', EVENT.source.categories)
                  .eq('booking_status', 'Completed'),
                db.from('review').select('booking_id'),
            ]);
            if (bks.error) throw bks.error;
            if (mine.error) throw mine.error;
            const reviewed = new Set(mine.data.map(x => x.booking_id));
            const options = bks.data.filter(b => !reviewed.has(b.booking_id)).map(b => ({
                value: b.booking_id,
                label: `${b.business_name} - ${b.package_name} (${formatDate(b.service_date)})`,
            }));
            return [
                { name: 'booking_id', label: 'Completed booking', type: 'select', required: true, options,
                  emptyText: options.length ? 'Choose a booking' : 'No completed bookings left to review',
                  hint: 'Only completed bookings can be reviewed, once each.' },
                { name: 'rating', label: 'Rating', type: 'select', required: true, value: '5',
                  options: [[5, 'Excellent'], [4, 'Very good'], [3, 'Good'], [2, 'Fair'], [1, 'Poor']]
                      .map(([n, t]) => ({ value: n, label: `${'★'.repeat(n)}  ${n} - ${t}` })) },
                { name: 'comments', label: 'Comments', type: 'textarea', maxlength: 300 },
            ];
        },

        async save(v) {
            const { error } = await db.from('review').insert({
                booking_id: Number(v.booking_id),
                rating: Number(v.rating),
                comments: v.comments.trim() || null,
            });
            return error;
        },
    },

    // -----------------------------------------------------------------
    // VENDOR_CATEGORY  (admin page)
    // -----------------------------------------------------------------
    category: {
        title: 'Vendor Categories',
        tableName: 'vendor_category table',
        searchHint: 'Search categories',
        key: r => r.category_id,

        async load() {
            const { data, error } = await db.from('vendor_category')
                .select('*, vendor(count)').order('category_name');
            if (error) throw error;
            return data;
        },

        columns: [
            { label: 'No.',         html: r => `#${r.category_id}` },
            { label: 'Category',    html: r => esc(r.category_name) },
            { label: 'Description', html: r => esc(r.description || '—') },
            { label: 'Vendors',     html: r => r.vendor?.[0]?.count ?? 0, cls: 'num' },
        ],

        canAdd: () => isAdmin(),
        addNote: 'Only administrators can manage categories.',
        canEdit: () => isAdmin(),
        canDelete: () => isAdmin(),

        async form(r) {
            return [
                { name: 'category_name', label: 'Category name', type: 'text', maxlength: 40, required: true, value: r?.category_name },
                { name: 'description', label: 'Description', type: 'text', maxlength: 150, value: r?.description },
            ];
        },

        async save(v, r) {
            const row = { category_name: v.category_name.trim(), description: v.description.trim() || null };
            if (r) return checkChanged(await db.from('vendor_category').update(row).eq('category_id', r.category_id).select());
            const { error } = await db.from('vendor_category').insert(row);
            return error;
        },

        async remove(r) {
            // ON DELETE RESTRICT: a category that still has vendors cannot be deleted
            return checkChanged(await db.from('vendor_category').delete().eq('category_id', r.category_id).select());
        },
    },
};


// =====================================================================
// PAGE: header, sign-in, table, search
// =====================================================================

function renderHeader() {
    document.getElementById('backIcon').innerHTML = ICONS.back;
    document.getElementById('backLink').href = EVENT.side ? `index.html#ev-${EVENT.key}` : 'index.html';
    const title = HAS_TABS && TAB.key !== 'bookings' ? SPEC.title : EVENT.pageTitle;
    document.title = `Wedora | ${title}`;
    const categories = HAS_TABS ? ` &middot; ${EVENT.source.categories.join(', ')}` : '';
    const tabs = HAS_TABS ? `<nav class="tabs" aria-label="Sections">${TABS.map(t =>
        `<a href="event.html?e=${EVENT.key}&tab=${t.key}" class="${t.key === TAB.key ? 'active' : ''}">${t.label}</a>`).join('')}</nav>` : '';
    document.getElementById('recHeader').innerHTML = `
        <div class="icon">${ICONS[EVENT.icon]}</div>
        <div class="event-line">${EVENT.when} &middot; ${EVENT.title}</div>
        <h1>${title}</h1>
        <div class="table-name">from the ${SPEC.tableName}${categories}</div>
        ${tabs}`;
}

async function renderSession() {
    const user = await getCurrentUser();
    const box = document.getElementById('sessionInfo');
    if (!user) { box.innerHTML = ''; return; }
    box.innerHTML = `${esc(user.email)} &middot; ${isAdmin() ? 'Admin' : 'Client'}
        ${isAdmin() ? `<a class="link-btn" href="reports.html" style="margin-left:10px">Reports</a>
                       <a class="link-btn" href="event.html?e=categories" style="margin-left:10px">Categories</a>` : ''}
        <button class="link-btn" id="signOutBtn">Sign out</button>`;
    document.getElementById('signOutBtn').onclick = async () => { await db.auth.signOut(); location.reload(); };
}

function renderSignIn() {
    document.getElementById('content').innerHTML = `
        <div class="panel">
            <p>Please sign in to view these records.</p>
            <div id="signInMsg"></div>
            <form id="signInForm" novalidate>
                <div class="field"><label for="siEmail">Email</label><input id="siEmail" type="email" autocomplete="email"></div>
                <div class="field"><label for="siPass">Password</label><input id="siPass" type="password" autocomplete="current-password"></div>
                <button class="btn-line solid" type="submit" id="siBtn" style="width:100%">Sign in</button>
            </form>
            <p style="font-size:15px;margin:18px 0 0">New couple? <a href="register.html">Create an account</a></p>
        </div>`;

    document.getElementById('signInForm').onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('siEmail').value.trim();
        const password = document.getElementById('siPass').value;
        const msg = document.getElementById('signInMsg');
        if (!email || !password) { msg.innerHTML = '<div class="notice error">Please enter your email and password.</div>'; return; }

        const btn = document.getElementById('siBtn');
        btn.disabled = true; btn.textContent = 'Signing in…';
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) {
            msg.innerHTML = `<div class="notice error">${esc(friendlyError(error))}</div>`;
            btn.disabled = false; btn.textContent = 'Sign in';
            return;
        }
        start();   // signed in: load the records
    };
}

function renderRecordsShell() {
    const addBtn = SPEC.canAdd()
        ? `<button class="btn-line" id="addBtn">+ Add record</button>`
        : `<span class="sub" style="max-width:440px;text-align:right">${SPEC.addNote}</span>`;

    document.getElementById('content').innerHTML = `
        <div class="toolbar">
            <input class="search" id="search" type="search" placeholder="${SPEC.searchHint}" aria-label="Search records" value="${esc(SEARCH)}">
            ${SPEC.toolbarExtra ? SPEC.toolbarExtra() : ''}
            ${addBtn}
        </div>
        <div id="pageNotice"></div>
        <div id="tableArea"><p class="state">Loading records&hellip;</p></div>`;

    document.getElementById('search').oninput = (e) => { SEARCH = e.target.value.trim().toLowerCase(); renderTable(); };
    if (SPEC.canAdd()) document.getElementById('addBtn').onclick = () => openForm(null);
    if (SPEC.afterShell) SPEC.afterShell();
}

async function loadRows() {
    document.getElementById('tableArea').innerHTML = '<p class="state">Loading records&hellip;</p>';
    try {
        ROWS = await SPEC.load();
        renderTable();
    } catch (error) {
        document.getElementById('tableArea').innerHTML =
            `<p class="state error">Could not load records: ${esc(niceError(error))}</p>`;
    }
}

// search = keep rows where any visible column contains the text
// (column HTML is turned back into plain text, so "&amp;" matches "&")
const plainBox = document.createElement('div');
function plainText(html) {
    plainBox.innerHTML = String(html);
    return plainBox.textContent + ' ';
}
function visibleRows() {
    if (!SEARCH) return ROWS;
    return ROWS.filter(r => SPEC.columns
        .map(c => plainText(c.html(r)))
        .join(' ').toLowerCase().includes(SEARCH));
}

function renderTable() {
    const area = document.getElementById('tableArea');
    const rows = visibleRows();

    if (!ROWS.length) {
        area.innerHTML = `<p class="state">No records yet.${SPEC.canAdd() ? ' Use “Add record” to create the first one.' : ''}</p>`;
        return;
    }
    if (!rows.length) {
        area.innerHTML = `<p class="state">No records match “${esc(SEARCH)}”.</p>`;
        return;
    }

    const head = SPEC.columns.map(c => `<th class="${c.cls || ''}">${c.label}</th>`).join('') + '<th></th>';
    const body = rows.map(r => {
        const cells = SPEC.columns.map(c => `<td class="${c.cls || ''}">${c.html(r)}</td>`).join('');
        const actions = [];
        (SPEC.extraActions ? SPEC.extraActions(r) : []).forEach((a, i) =>
            actions.push(`<button class="link-btn ${a.danger ? 'danger' : ''}" data-extra="${i}" data-key="${SPEC.key(r)}">${a.label}</button>`));
        if (SPEC.canEdit(r))   actions.push(`<button class="link-btn" data-edit="${SPEC.key(r)}">Edit</button>`);
        if (SPEC.canDelete(r)) actions.push(`<button class="link-btn danger" data-delete="${SPEC.key(r)}">Delete</button>`);
        return `<tr>${cells}<td class="actions"><div class="act">${actions.join('')}</div></td></tr>`;
    }).join('');

    area.innerHTML = `
        <div class="table-wrap"><table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
        <p class="count-line">${rows.length} of ${ROWS.length} record${ROWS.length === 1 ? '' : 's'}</p>`;

    const find = key => ROWS.find(r => String(SPEC.key(r)) === String(key));
    area.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openForm(find(b.dataset.edit)));
    area.querySelectorAll('[data-delete]').forEach(b => b.onclick = () => deleteRow(find(b.dataset.delete)));
    area.querySelectorAll('[data-extra]').forEach(b => b.onclick = () => {
        const row = find(b.dataset.key);
        SPEC.extraActions(row)[Number(b.dataset.extra)].run();
    });
}

function pageNotice(text, type) {
    document.getElementById('pageNotice').innerHTML = text ? `<div class="notice ${type}">${text}</div>` : '';
}


// =====================================================================
// ADD / EDIT form (inside the pop-up)
// =====================================================================

const modalBackdrop = document.getElementById('modalBackdrop');
const modal = document.getElementById('modal');

function openModal(html, wide = false) {
    modal.className = 'modal' + (wide ? ' wide' : '');
    modal.innerHTML = html;
    modalBackdrop.classList.add('open');
}
function closeModal() { modalBackdrop.classList.remove('open'); modal.innerHTML = ''; }
modalBackdrop.addEventListener('click', e => { if (e.target === modalBackdrop) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function fieldHtml(f) {
    const req = f.required ? 'required' : '';
    const val = f.value ?? '';
    let input;
    if (f.type === 'select') {
        input = `<select id="f_${f.name}" name="${f.name}" ${req}>
            <option value="">${esc(f.emptyText || '—')}</option>
            ${f.options.map(o => option(o.value, o.label, val)).join('')}
        </select>`;
    } else if (f.type === 'textarea') {
        input = `<textarea id="f_${f.name}" name="${f.name}" rows="3" ${f.maxlength ? `maxlength="${f.maxlength}"` : ''} ${req}>${esc(val)}</textarea>`;
    } else {
        const attrs = [
            f.min !== null && f.min !== undefined ? `min="${f.min}"` : '',
            f.step ? `step="${f.step}"` : '',
            f.maxlength ? `maxlength="${f.maxlength}"` : '',
            f.pattern ? `pattern="${f.pattern}"` : '',
        ].join(' ');
        input = `<input id="f_${f.name}" name="${f.name}" type="${f.type}" value="${esc(val)}" ${attrs} ${req}>`;
    }
    return `<div class="field"><label for="f_${f.name}">${f.label}${f.required ? ' *' : ''}</label>${input}
            ${f.hint ? `<div class="hint">${f.hint}</div>` : ''}</div>`;
}

// put fields marked "half" side by side in pairs
function fieldsHtml(fields) {
    let html = '', pending = [];
    const flush = () => { if (pending.length) { html += `<div class="field-row">${pending.join('')}</div>`; pending = []; } };
    fields.forEach(f => {
        if (f.half) { pending.push(fieldHtml(f)); if (pending.length === 2) flush(); }
        else { flush(); html += fieldHtml(f); }
    });
    flush();
    return html;
}

// row = null to add, a row to edit.  defaults = pre-filled values.
// spec = which kind of record (the Packages tab opens a BOOKING form).
async function openForm(row, defaults = {}, spec = SPEC) {
    openModal('<p class="state">Loading form&hellip;</p>');
    let fields;
    try {
        fields = await spec.form(row, defaults);
    } catch (error) {
        openModal(`<p class="state error">${esc(niceError(error))}</p>
                   <div class="buttons"><button class="btn-line" onclick="closeModal()">Close</button></div>`);
        return;
    }

    openModal(`
        <h2>${row ? 'Edit record' : 'Add record'}</h2>
        <div class="modal-sub">${spec === SPECS.booking ? 'Booking' : (spec.title || EVENT.pageTitle)}</div>
        <div id="formMsg"></div>
        <form id="recordForm" novalidate>
            ${fieldsHtml(fields)}
            <div class="buttons">
                <button type="button" class="btn-line" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn-line solid" id="saveBtn">${row ? 'Save changes' : 'Add record'}</button>
            </div>
        </form>`);

    document.getElementById('recordForm').onsubmit = async (e) => {
        e.preventDefault();
        const form = e.target;
        const msg = document.getElementById('formMsg');

        // HTML5 validation (required, min, maxlength, pattern)
        if (!form.checkValidity()) {
            const bad = form.querySelector(':invalid');
            const label = bad.closest('.field').querySelector('label').textContent.replace(' *', '');
            msg.innerHTML = `<div class="notice error">Please check “${esc(label)}”: ${esc(bad.validationMessage)}</div>`;
            bad.focus();
            return;
        }

        const values = Object.fromEntries(new FormData(form).entries());
        const btn = document.getElementById('saveBtn');
        btn.disabled = true; btn.textContent = 'Saving…';

        const error = await spec.save(values, row);
        if (error) {
            msg.innerHTML = `<div class="notice error">${esc(niceError(error))}</div>`;
            btn.disabled = false; btn.textContent = row ? 'Save changes' : 'Add record';
            return;
        }
        closeModal();
        if (spec !== SPEC) {
            pageNotice(`Booking added. See it under <a href="event.html?e=${EVENT.key}&tab=bookings">Bookings</a>.`, 'success');
        } else {
            pageNotice(row ? 'Record updated.' : 'Record added.', 'success');
        }
        loadRows();
    };
}

async function deleteRow(row) {
    if (!confirm('Delete this record permanently?')) return;
    const error = await SPEC.remove(row);
    if (error) { pageNotice(esc(niceError(error)), 'error'); return; }
    pageNotice('Record deleted.', 'success');
    loadRows();
}

async function cancelBooking(row) {
    if (!confirm('Cancel this booking? The date becomes available to others again.')) return;
    const res = await db.from('booking').update({ booking_status: 'Cancelled' })
        .eq('booking_id', row.booking_id).select();
    const error = checkChanged(res);
    if (error) { pageNotice(esc(niceError(error)), 'error'); return; }
    pageNotice('Booking cancelled.', 'success');
    loadRows();
}


// =====================================================================
// PAYMENTS for one booking  (BOOKING 1 : N PAYMENT)
// Balance = agreed amount - SUM(successful payments), calculated by the
// booking_summary view, never stored.
// =====================================================================

async function openPayments(bookingRow) {
    openModal('<p class="state">Loading payments&hellip;</p>', true);

    // fresh totals for this booking from the view
    const { data: b, error: bErr } = await db.from('booking_summary').select('*')
        .eq('booking_id', bookingRow.booking_id).single();
    const { data: pays, error: pErr } = await db.from('payment').select('*')
        .eq('booking_id', bookingRow.booking_id).order('payment_date');

    if (bErr || pErr) {
        openModal(`<p class="state error">${esc(niceError(bErr || pErr))}</p>
                   <div class="buttons"><button class="btn-line" onclick="closeModal()">Close</button></div>`, true);
        return;
    }

    const list = pays.length ? `
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Date</th><th>Type</th><th>Mode</th><th>Reference</th><th class="num">Amount</th><th>Status</th>${isAdmin() ? '<th></th>' : ''}</tr></thead>
          <tbody>${pays.map(p => `
            <tr><td>${formatDate(p.payment_date)}</td><td>${esc(p.payment_type)}</td><td>${esc(p.payment_mode)}</td>
                <td>${esc(p.transaction_ref || '—')}</td><td class="num">${rupees(p.amount, 0)}</td><td>${statusTag(p.payment_status)}</td>
                ${isAdmin() ? `<td class="actions"><button class="link-btn danger" data-delpay="${p.payment_id}">Delete</button></td>` : ''}</tr>`).join('')}
          </tbody></table></div>`
        : '<p class="state">No payments recorded yet.</p>';

    const canPay = b.booking_status !== 'Cancelled' && Number(b.balance) > 0;
    const payForm = canPay ? `
        <form id="payForm" novalidate style="margin-top:22px">
          <div id="payMsg"></div>
          <div class="field-row">
            ${fieldHtml({ name: 'amount', label: 'Amount (₹)', type: 'number', min: 1, step: '0.01', required: true, hint: `Balance due: ${rupees(b.balance)}` })}
            ${fieldHtml({ name: 'payment_type', label: 'Type', type: 'select', required: true, value: Number(b.total_paid) > 0 ? 'Instalment' : 'Advance',
                          options: ['Advance', 'Instalment', 'Final'].map(s => ({ value: s, label: s })) })}
          </div>
          <div class="field-row">
            ${fieldHtml({ name: 'payment_mode', label: 'Mode', type: 'select', required: true, value: 'UPI',
                          options: ['Cash', 'UPI', 'Card', 'Net Banking'].map(s => ({ value: s, label: s })) })}
            ${fieldHtml({ name: 'transaction_ref', label: 'Transaction reference', type: 'text', maxlength: 50, hint: 'Required except for cash' })}
          </div>
          ${isAdmin() ? fieldHtml({ name: 'payment_status', label: 'Payment status', type: 'select', value: 'Success',
                          options: ['Success', 'Pending', 'Failed'].map(s => ({ value: s, label: s })) }) : ''}
          <div class="buttons"><button class="btn-line" type="button" onclick="closeModal()">Close</button>
               <button class="btn-line solid" type="submit" id="payBtn">Record payment</button></div>
        </form>`
        : `<p class="state">${b.booking_status === 'Cancelled' ? 'This booking is cancelled.' : 'This booking is fully paid.'}</p>
           <div class="buttons"><button class="btn-line" onclick="closeModal()">Close</button></div>`;

    openModal(`
        <h2>Payments</h2>
        <div class="modal-sub">${esc(b.business_name)} &middot; ${esc(b.couple)}</div>
        <div class="money-line">
            <span>Agreed <b>${rupees(b.agreed_amount, 0)}</b></span>
            <span>Paid <b>${rupees(b.total_paid, 0)}</b></span>
            <span>Balance <b>${rupees(b.balance, 0)}</b></span>
        </div>
        ${list}
        ${payForm}`, true);

    modal.querySelectorAll('[data-delpay]').forEach(btn => btn.onclick = async () => {
        if (!confirm('Delete this payment?')) return;
        const error = checkChanged(await db.from('payment').delete().eq('payment_id', btn.dataset.delpay).select());
        if (error) { alert(niceError(error)); return; }
        await openPayments(bookingRow);
        loadRows();
    });

    const form = document.getElementById('payForm');
    if (!form) return;
    form.onsubmit = async (e) => {
        e.preventDefault();
        const msg = document.getElementById('payMsg');
        const v = Object.fromEntries(new FormData(form).entries());
        const amount = toNumber(v.amount);
        const status = v.payment_status || 'Success';

        // simple checks before asking the database (the database checks again)
        if (!amount || amount <= 0)            { msg.innerHTML = '<div class="notice error">Enter an amount greater than zero.</div>'; return; }
        if (status === 'Success' && amount > Number(b.balance)) {
            msg.innerHTML = `<div class="notice error">Amount is more than the balance due (${rupees(b.balance)}).</div>`; return;
        }
        if (v.payment_mode !== 'Cash' && !v.transaction_ref.trim()) {
            msg.innerHTML = '<div class="notice error">Enter the transaction reference for UPI, card or net banking.</div>'; return;
        }

        document.getElementById('payBtn').disabled = true;
        const { error } = await db.from('payment').insert({
            booking_id: b.booking_id, amount,
            payment_mode: v.payment_mode, payment_type: v.payment_type,
            transaction_ref: v.transaction_ref.trim() || null, payment_status: status,
        });
        if (error) {
            msg.innerHTML = `<div class="notice error">${esc(niceError(error))}</div>`;
            document.getElementById('payBtn').disabled = false;
            return;
        }
        await openPayments(bookingRow);   // refresh list and totals
        loadRows();                       // refresh Paid / Balance columns behind the pop-up
    };
}


// =====================================================================
// START
// =====================================================================

async function start() {
    if (!EVENT) {
        document.getElementById('content').innerHTML =
            '<p class="state error">Unknown timeline event. Please go back to the timeline.</p>';
        document.getElementById('backIcon').innerHTML = ICONS.back;
        return;
    }
    SPEC = HAS_TABS ? SPECS[TAB.spec] : SPECS[EVENT.source.entity];
    renderHeader();

    if (typeof SUPABASE_URL === 'undefined' || SUPABASE_URL.includes('YOUR-PROJECT-ID')) {
        document.getElementById('content').innerHTML =
            '<p class="state error">Supabase is not configured yet. Add your Project URL and key in js/supabase.js.</p>';
        return;
    }

    const user = await getCurrentUser();
    if (!user) { renderSession(); renderSignIn(); return; }

    ROLE = await getRole();
    if (ROLE === 'customer') {
        ME = await getCustomer();
        if (!ME) {
            document.getElementById('content').innerHTML =
                '<p class="state error">This login has no customer record linked to it. Please sign out and register.</p>';
            renderSession();
            return;
        }
    }
    if (ROLE === 'admin') ADMIN_ID = (await getAdmin())?.admin_id ?? null;
    renderSession();
    renderRecordsShell();
    loadRows();
}

start();
