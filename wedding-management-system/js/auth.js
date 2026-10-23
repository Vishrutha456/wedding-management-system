// =====================================================================
// js/auth.js  -  login state, page protection, navbar and footer
//
// Load order on every page:
//   1. supabase-js (CDN)   2. js/supabase.js   3. js/auth.js   4. page script
//
// How a logged-in user is linked to our tables:
//   Supabase Auth gives every user an id (uuid).  auth.users.id
//   CUSTOMER.auth_user_id  or  ADMIN.auth_user_id  stores that same id.
//   So "who is logged in?" = the customer/admin row whose auth_user_id
//   matches the session's user id.
// =====================================================================

// Pages inside the admin/ folder need "../" in front of every link.
const BASE = location.pathname.includes('/admin/') ? '../' : '';

// ---------- Session helpers ----------

// Returns the logged-in Supabase user, or null.
async function getCurrentUser() {
    const { data } = await db.auth.getSession();
    return data.session ? data.session.user : null;
}

// Returns 'admin', 'customer' or null (not logged in).
// is_admin() is the SQL function from schema.sql.
async function getRole() {
    const user = await getCurrentUser();
    if (!user) return null;
    const { data: isAdmin } = await db.rpc('is_admin');
    return isAdmin ? 'admin' : 'customer';
}

// Returns the CUSTOMER row of the logged-in user (RLS only lets them see their own).
async function getCustomer() {
    const user = await getCurrentUser();
    if (!user) return null;
    const { data } = await db.from('customer').select('*').eq('auth_user_id', user.id).maybeSingle();
    return data;
}

// Returns the ADMIN row of the logged-in user.
async function getAdmin() {
    const user = await getCurrentUser();
    if (!user) return null;
    const { data } = await db.from('admin').select('*').eq('auth_user_id', user.id).maybeSingle();
    return data;
}

// ---------- Page guards ----------
// Put   const customer = await requireCustomer();   at the top of a customer page.

async function requireCustomer() {
    const user = await getCurrentUser();
    if (!user) { location.href = BASE + 'login.html'; return null; }

    if (await getRole() === 'admin') { location.href = BASE + 'admin/dashboard.html'; return null; }

    const customer = await getCustomer();
    if (!customer) {
        document.querySelector('main').innerHTML = `
            <div class="container py-5"><div class="alert alert-warning">
            This login has no customer profile linked to it.
            Please <a href="#" onclick="logout()">log out</a> and register a new account.
            </div></div>`;
        return null;
    }
    return customer;
}

async function requireAdmin() {
    const user = await getCurrentUser();
    if (!user) { location.href = BASE + 'login.html'; return null; }

    const admin = await getAdmin();
    if (!admin) {
        document.querySelector('main').innerHTML = `
            <div class="container py-5"><div class="alert alert-danger">
            <b>Unauthorized.</b> Only administrators can open this page.
            <a href="${BASE}index.html">Go to home page</a>
            </div></div>`;
        return null;
    }
    return admin;
}

async function logout() {
    await db.auth.signOut();
    location.href = BASE + 'login.html';
}

// ---------- Navbar ----------
// Each page has <nav id="navbar"></nav> and calls renderNavbar('pageName')

async function renderNavbar(active = '') {
    const role = await getRole();
    let links = [];
    let right = '';

    if (role === 'admin') {
        links = [
            ['dashboard',  'admin/dashboard.html',  'Dashboard'],
            ['a-vendors',  'admin/vendors.html',    'Vendors'],
            ['categories', 'admin/categories.html', 'Categories'],
            ['a-venues',   'admin/venues.html',     'Venues'],
            ['a-bookings', 'admin/bookings.html',   'Bookings'],
            ['a-payments', 'admin/payments.html',   'Payments'],
            ['reports',    'admin/reports.html',    'Reports'],
        ];
        right = `<span class="user-chip me-2"><i class="bi bi-shield-lock"></i> Admin</span>
                 <button class="btn btn-sm btn-gold" onclick="logout()">Logout</button>`;
    } else if (role === 'customer') {
        const c = await getCustomer();
        links = [
            ['dashboard', 'customer-dashboard.html', 'Dashboard'],
            ['weddings',  'weddings.html',           'My Weddings'],
            ['venues',    'venues.html',             'Venues'],
            ['vendors',   'vendors.html',            'Vendors'],
            ['bookings',  'bookings.html',           'Bookings'],
            ['payments',  'payments.html',           'Payments'],
            ['reviews',   'reviews.html',            'Reviews'],
        ];
        const firstName = c ? esc(c.full_name.split(' ')[0]) : 'Account';
        right = `<a class="user-chip me-2 text-decoration-none" href="${BASE}reviews.html#profile">
                    <i class="bi bi-person-circle"></i> ${firstName}</a>
                 <button class="btn btn-sm btn-gold" onclick="logout()">Logout</button>`;
    } else {
        links = [
            ['home',    'index.html',   'Home'],
            ['venues',  'venues.html',  'Venues'],
            ['vendors', 'vendors.html', 'Vendors'],
        ];
        right = `<a class="btn btn-sm btn-outline-light me-2" href="${BASE}login.html">Login</a>
                 <a class="btn btn-sm btn-gold" href="${BASE}register.html">Register</a>`;
    }

    const items = links.map(([key, href, label]) =>
        `<li class="nav-item"><a class="nav-link ${key === active ? 'active' : ''}" href="${BASE}${href}">${label}</a></li>`
    ).join('');

    document.getElementById('navbar').outerHTML = `
    <nav class="navbar navbar-expand-lg navbar-wedding sticky-top">
      <div class="container">
        <a class="navbar-brand" href="${BASE}index.html"><i class="bi bi-flower1"></i> Vivaha<span>Hub</span></a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="mainNav">
          <ul class="navbar-nav me-auto ms-lg-3">${items}</ul>
          <div class="d-flex align-items-center mt-2 mt-lg-0">${right}</div>
        </div>
      </div>
    </nav>`;

    renderFooter();
}

function renderFooter() {
    if (document.querySelector('footer')) return;
    document.body.insertAdjacentHTML('beforeend', `
    <footer class="py-4 mt-5">
      <div class="container d-flex flex-wrap justify-content-between gap-2">
        <span><span class="brand serif">VivahaHub</span> &middot; Wedding Management and Vendoring System</span>
        <span>DBMS Mini Project &middot; Dept. of CSE, SJBIT</span>
      </div>
    </footer>`);
}

// ---------- Small display helpers ----------

// Indian Rupees: rupees(150000) -> ₹1,50,000.00   rupees(150000, 0) -> ₹1,50,000
function rupees(amount, decimals = 2) {
    return '₹' + Number(amount || 0).toLocaleString('en-IN',
        { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Escape text before putting it into innerHTML (prevents broken HTML / script injection)
function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// '2026-12-14' -> '14 Dec 2026'
function formatDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Coloured status badge
function statusBadge(status) {
    return `<span class="badge rounded-pill status-${esc(status)}">${esc(status)}</span>`;
}

// Today's date as 'YYYY-MM-DD' (local time) - used for date comparisons and min="" on date inputs
function todayISO() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
