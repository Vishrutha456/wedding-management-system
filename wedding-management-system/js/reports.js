// =====================================================================
// js/reports.js  -  Admin Reports page (reports.html)
//
// Every number on this page is calculated from live database rows:
//   COUNT  -> number of customers, weddings, vendors, bookings
//   SUM    -> amount booked, received (successful payments), outstanding
//   GROUP BY category / vendor / status
//   AVG    -> vendor ratings (vendor_rating view)
// Only an ADMIN can open it - Row Level Security lets admins read all rows.
// =====================================================================

let ADMIN = null;

const sum = (rows, pick) => rows.reduce((total, r) => total + Number(pick(r) || 0), 0);

// GROUP BY in JavaScript: { key: { total, count } }
function groupBy(rows, keyOf, valueOf) {
    const groups = {};
    rows.forEach(r => {
        const k = keyOf(r);
        groups[k] = groups[k] || { key: k, total: 0, count: 0 };
        groups[k].total += Number(valueOf(r) || 0);
        groups[k].count += 1;
    });
    return Object.values(groups).sort((a, b) => b.total - a.total);
}


// ---------------------------------------------------------------------
// Sign-in / access
// ---------------------------------------------------------------------

async function renderSession() {
    const user = await getCurrentUser();
    const box = document.getElementById('sessionInfo');
    if (!user) { box.innerHTML = ''; return; }
    box.innerHTML = `${esc(user.email)} <button class="link-btn" id="signOutBtn">Sign out</button>`;
    document.getElementById('signOutBtn').onclick = async () => { await db.auth.signOut(); location.reload(); };
}

function renderSignIn() {
    document.getElementById('content').innerHTML = `
        <div class="panel">
            <p>Reports are available to administrators. Please sign in.</p>
            <div id="signInMsg"></div>
            <form id="signInForm" novalidate>
                <div class="field"><label for="siEmail">Email</label><input id="siEmail" type="email" autocomplete="email"></div>
                <div class="field"><label for="siPass">Password</label><input id="siPass" type="password" autocomplete="current-password"></div>
                <button class="btn-line solid" type="submit" id="siBtn" style="width:100%">Sign in</button>
            </form>
        </div>`;
    document.getElementById('signInForm').onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('siEmail').value.trim();
        const password = document.getElementById('siPass').value;
        const msg = document.getElementById('signInMsg');
        if (!email || !password) { msg.innerHTML = '<div class="notice error">Please enter your email and password.</div>'; return; }
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) { msg.innerHTML = `<div class="notice error">${esc(friendlyError(error))}</div>`; return; }
        start();
    };
}


// ---------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------

function statTile(label, value, note = '') {
    return `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div>
            ${note ? `<div class="stat-note">${note}</div>` : ''}</div>`;
}

// horizontal bar list: one ivory bar per row, exact value printed beside it
function barList(groups, valueText, tooltip) {
    if (!groups.length) return '<p class="state">No data yet.</p>';
    const max = Math.max(...groups.map(g => g.total)) || 1;
    return `<div class="bars">${groups.map(g => `
        <div class="bar-row" title="${esc(tooltip(g))}">
            <span class="bar-label">${esc(g.key)}</span>
            <span class="bar-track"><span class="bar-fill" style="width:${Math.max(2, (g.total / max) * 100)}%"></span></span>
            <span class="bar-value">${valueText(g)}</span>
        </div>`).join('')}</div>`;
}

function card(title, sql, body) {
    return `<section class="report-card">
        <h2>${title}</h2>
        <div class="report-sql">${sql}</div>
        ${body}
    </section>`;
}


// ---------------------------------------------------------------------
// Load everything and draw the page
// ---------------------------------------------------------------------

async function loadReports() {
    const content = document.getElementById('content');
    content.innerHTML = '<p class="state">Calculating reports&hellip;</p>';

    // run the queries at the same time
    const [cust, wed, ven, bks, pays, rates] = await Promise.all([
        db.from('customer').select('*', { count: 'exact', head: true }),
        db.from('wedding').select('wedding_id, bride_name, groom_name, wedding_date, guest_count, status, venue(venue_name, city)').order('wedding_date'),
        db.from('vendor').select('vendor_id, business_name, owner_name, phone, city, verified_by, vendor_category(category_name)').order('business_name'),
        db.from('booking_summary').select('*'),
        db.from('payment').select('payment_id, booking_id, amount, payment_status, payment_mode'),
        db.from('vendor_rating').select('*').gt('review_count', 0).order('avg_rating', { ascending: false }),
    ]);

    const failed = [cust, wed, ven, bks, pays, rates].find(r => r.error);
    if (failed) { content.innerHTML = `<p class="state error">Could not load reports: ${esc(friendlyError(failed.error))}</p>`; return; }

    const weddings = wed.data, vendors = ven.data, bookings = bks.data, payments = pays.data, ratings = rates.data;
    const active   = bookings.filter(b => b.booking_status !== 'Cancelled');
    const success  = payments.filter(p => p.payment_status === 'Success');
    const today    = todayISO();
    const byId     = Object.fromEntries(bookings.map(b => [b.booking_id, b]));

    // ---- headline numbers ----
    const stats = `
        <div class="stats">
            ${statTile('Clients', cust.count ?? '—')}
            ${statTile('Active weddings', weddings.filter(w => w.status !== 'Cancelled').length)}
            ${statTile('Verified vendors', vendors.filter(v => v.verified_by !== null).length)}
            ${statTile('Awaiting verification', vendors.filter(v => v.verified_by === null).length)}
            ${statTile('Active bookings', active.length)}
            ${statTile('Total booked', rupees(sum(active, b => b.agreed_amount), 0))}
            ${statTile('Received', rupees(sum(success, p => p.amount), 0), `${success.length} successful payments`)}
            ${statTile('Outstanding', rupees(sum(active, b => b.balance), 0), 'agreed − received')}
        </div>`;

    // ---- revenue by category (payment -> booking -> package -> vendor -> category) ----
    const revCategory = groupBy(success, p => byId[p.booking_id]?.category_name || 'Other', p => p.amount);
    // ---- revenue by vendor (top 5) ----
    const revVendor = groupBy(success, p => byId[p.booking_id]?.business_name || 'Other', p => p.amount).slice(0, 5);
    // ---- bookings by status ----
    const byStatus = groupBy(bookings, b => b.booking_status, b => b.agreed_amount);
    // ---- most booked vendors ----
    const mostBooked = groupBy(active, b => b.business_name, () => 1).slice(0, 5);

    const statusTable = `
        <div class="table-wrap"><table class="data">
            <thead><tr><th>Status</th><th class="num">Bookings</th><th class="num">Amount</th></tr></thead>
            <tbody>${byStatus.map(s => `<tr><td><span class="status ${esc(s.key)}">${esc(s.key)}</span></td>
                <td class="num">${s.count}</td><td class="num">${rupees(s.total, 0)}</td></tr>`).join('')}</tbody>
        </table></div>`;

    const ratingTable = ratings.length ? `
        <div class="table-wrap"><table class="data">
            <thead><tr><th>Vendor</th><th class="num">Reviews</th><th class="num">Average</th></tr></thead>
            <tbody>${ratings.map(r => `<tr><td>${esc(r.business_name)}</td><td class="num">${r.review_count}</td>
                <td class="num">${'★'.repeat(Math.round(r.avg_rating))}<span style="opacity:.35">${'★'.repeat(5 - Math.round(r.avg_rating))}</span> ${r.avg_rating}</td></tr>`).join('')}</tbody>
        </table></div>` : '<p class="state">No reviews yet.</p>';

    const upcoming = weddings.filter(w => w.wedding_date >= today && w.status !== 'Cancelled').slice(0, 5);
    const upcomingTable = upcoming.length ? `
        <div class="table-wrap"><table class="data">
            <thead><tr><th>Couple</th><th>Date</th><th>Venue</th><th class="num">Guests</th></tr></thead>
            <tbody>${upcoming.map(w => `<tr><td>${esc(w.bride_name)} &amp; ${esc(w.groom_name)}</td><td>${formatDate(w.wedding_date)}</td>
                <td>${w.venue ? esc(w.venue.venue_name) : '<span class="sub">Not chosen</span>'}</td><td class="num">${w.guest_count}</td></tr>`).join('')}</tbody>
        </table></div>` : '<p class="state">No upcoming weddings.</p>';

    const pending = vendors.filter(v => v.verified_by === null);
    const verifyTable = pending.length ? `
        <div class="table-wrap"><table class="data">
            <thead><tr><th>Vendor</th><th>Category</th><th>City</th><th></th></tr></thead>
            <tbody>${pending.map(v => `<tr><td>${esc(v.business_name)}<span class="sub">${esc(v.owner_name || '')} &middot; ${esc(v.phone)}</span></td>
                <td>${esc(v.vendor_category?.category_name || '')}</td><td>${esc(v.city)}</td>
                <td class="actions"><button class="btn-line small" data-verify="${v.vendor_id}">Verify</button></td></tr>`).join('')}</tbody>
        </table></div>` : '<p class="state">All vendors are verified.</p>';

    content.innerHTML = `
        <div id="pageNotice"></div>
        ${stats}
        <div class="report-grid">
            ${card('Revenue by category', 'SUM(amount) of successful payments, GROUP BY category',
                barList(revCategory, g => rupees(g.total, 0), g => `${g.key}: ${rupees(g.total, 0)} from ${g.count} payment(s)`))}
            ${card('Top vendors by revenue', 'SUM(amount) GROUP BY vendor, ORDER BY revenue DESC, LIMIT 5',
                barList(revVendor, g => rupees(g.total, 0), g => `${g.key}: ${rupees(g.total, 0)} received`))}
            ${card('Most booked vendors', 'COUNT(*) of non-cancelled bookings GROUP BY vendor',
                barList(mostBooked, g => `${g.total} booking${g.total === 1 ? '' : 's'}`, g => `${g.key}: ${g.total} active booking(s)`))}
            ${card('Bookings by status', 'COUNT(*), SUM(agreed_amount) GROUP BY booking_status', statusTable)}
            ${card('Vendor ratings', 'AVG(rating) from the vendor_rating view', ratingTable)}
            ${card('Upcoming weddings', 'WHERE wedding_date >= CURRENT_DATE AND status &lt;&gt; \'Cancelled\'', upcomingTable)}
        </div>
        ${card('Vendors awaiting verification', 'WHERE verified_by IS NULL &nbsp;·&nbsp; Verify = UPDATE vendor SET verified_by = admin_id', verifyTable)}`;

    // Verify button: UPDATE vendor SET verified_by = <this admin> WHERE vendor_id = ...
    content.querySelectorAll('[data-verify]').forEach(btn => btn.onclick = async () => {
        btn.disabled = true;
        const { data, error } = await db.from('vendor')
            .update({ verified_by: ADMIN.admin_id })
            .eq('vendor_id', btn.dataset.verify)
            .select();
        if (error || !data.length) {
            document.getElementById('pageNotice').innerHTML =
                `<div class="notice error">${esc(error ? friendlyError(error) : 'Not allowed.')}</div>`;
            btn.disabled = false;
            return;
        }
        await loadReports();
        document.getElementById('pageNotice').innerHTML =
            `<div class="notice success">${esc(data[0].business_name)} is now verified and visible to customers.</div>`;
    });
}


// ---------------------------------------------------------------------
// START
// ---------------------------------------------------------------------

async function start() {
    document.getElementById('backIcon').innerHTML = ICONS.back;
    document.getElementById('lotus').innerHTML = ICONS.lotus;

    if (!(await getCurrentUser())) { renderSession(); renderSignIn(); return; }
    renderSession();

    ADMIN = await getAdmin();
    if (!ADMIN) {
        document.getElementById('content').innerHTML =
            '<p class="state error">Unauthorized: only administrators can view reports. Sign out and sign in as an admin.</p>';
        return;
    }
    loadReports();
}

start();
