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

const eventKey = new URLSearchParams(location.search).get('e');
const EVENT = EVENTS.find(ev => ev.key === eventKey);

let ROLE = null;        // 'admin' or 'customer'
let ME = null;          // the CUSTOMER row of a signed-in customer
let SPEC = null;        // how to load/show/save the current table (see SPECS below)
let ROWS = [];          // rows loaded from the database
let SEARCH = '';        // current search text

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
    return friendlyError(error);
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

        async form(r) {
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
                { name: 'package_id', label: 'Vendor package', type: 'select', required: true,
                  options: this.packages.map(p => ({ value: p.package_id,
                      label: `${p.vendor.business_name} - ${p.package_name} (${rupees(p.price, 0)} ${p.price_unit.toLowerCase()})` })),
                  emptyText: this.packages.length ? 'Choose a package' : 'No packages available' },
                { name: 'service_date', label: 'Service date', type: 'date', required: true, min: isAdmin() ? null : todayISO() },
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
};


// =====================================================================
// PAGE: header, sign-in, table, search
// =====================================================================

function renderHeader() {
    document.getElementById('backIcon').innerHTML = ICONS.back;
    document.getElementById('backLink').href = `index.html#ev-${EVENT.key}`;
    document.title = `Wedora | ${EVENT.pageTitle}`;
    document.getElementById('recHeader').innerHTML = `
        <div class="icon">${ICONS[EVENT.icon]}</div>
        <div class="event-line">${EVENT.when} &middot; ${EVENT.title}</div>
        <h1>${EVENT.pageTitle}</h1>
        <div class="table-name">from the ${SPEC.tableName}</div>`;
}

async function renderSession() {
    const user = await getCurrentUser();
    const box = document.getElementById('sessionInfo');
    if (!user) { box.innerHTML = ''; return; }
    box.innerHTML = `${esc(user.email)} &middot; ${isAdmin() ? 'Admin' : 'Client'}
        ${isAdmin() ? '<a class="link-btn" href="reports.html" style="margin-left:10px">Reports</a>' : ''}
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
            <input class="search" id="search" type="search" placeholder="${SPEC.searchHint}" aria-label="Search records">
            ${addBtn}
        </div>
        <div id="pageNotice"></div>
        <div id="tableArea"><p class="state">Loading records&hellip;</p></div>`;

    document.getElementById('search').oninput = (e) => { SEARCH = e.target.value.trim().toLowerCase(); renderTable(); };
    if (SPEC.canAdd()) document.getElementById('addBtn').onclick = () => openForm(null);
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
function visibleRows() {
    if (!SEARCH) return ROWS;
    return ROWS.filter(r => SPEC.columns
        .map(c => String(c.html(r)).replace(/<[^>]+>/g, ' '))
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

async function openForm(row) {
    openModal('<p class="state">Loading form&hellip;</p>');
    let fields;
    try {
        fields = await SPEC.form(row);
    } catch (error) {
        openModal(`<p class="state error">${esc(niceError(error))}</p>
                   <div class="buttons"><button class="btn-line" onclick="closeModal()">Close</button></div>`);
        return;
    }

    openModal(`
        <h2>${row ? 'Edit record' : 'Add record'}</h2>
        <div class="modal-sub">${EVENT.pageTitle}</div>
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

        const error = await SPEC.save(values, row);
        if (error) {
            msg.innerHTML = `<div class="notice error">${esc(niceError(error))}</div>`;
            btn.disabled = false; btn.textContent = row ? 'Save changes' : 'Add record';
            return;
        }
        closeModal();
        pageNotice(row ? 'Record updated.' : 'Record added.', 'success');
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
    SPEC = SPECS[EVENT.source.entity];
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
    renderSession();
    renderRecordsShell();
    loadRows();
}

start();
