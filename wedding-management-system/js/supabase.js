// =====================================================================
// js/supabase.js  -  ONE shared Supabase client for every page
//
// Every HTML page loads two scripts, in this order:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//   <script src="js/supabase.js"></script>          (use ../js/ from admin pages)
//
// After that, any page script can use the variable  db  e.g.
//   const { data, error } = await db.from('venue').select('*');
// =====================================================================

// 1. Paste YOUR values here (Supabase Dashboard -> Connect, or
//    Project Settings -> API Keys).
   const SUPABASE_URL = 'https://qwtjsyvudramoaiepxxw.supabase.co';

// 2. Use the PUBLISHABLE key (starts with sb_publishable_) or the legacy
//    "anon public" key. It is safe in browser code because Row Level
//    Security decides what each user can see.
//    NEVER paste the secret / service_role key here - it bypasses RLS.
const SUPABASE_KEY = 'sb_publishable_OlPzg1WdtTdCvg07iJK5Yg_sVQsduRJ';

// 3. Create the client. "supabase" is the global object provided by the
//    CDN script; we call our client "db" so the two don't get mixed up.
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


// ---------------------------------------------------------------------
// Small helpers shared by all pages
// ---------------------------------------------------------------------

// Turn database error messages into friendly text for the user.
function friendlyError(error) {
    if (!error) return '';
    const msg = error.message || String(error);

    if (msg.includes('uq_package_date_active'))  return 'This package is already booked on that date. Please choose another date or package.';
    if (msg.includes('uq_venue_date_active'))    return 'This venue is already booked on that date.';
    if (msg.includes('uq_booking'))              return 'You have already booked this package for this wedding on that date.';
    if (msg.includes('review_booking_id_key'))   return 'You have already reviewed this booking.';
    if (msg.includes('chk_txn_ref'))             return 'A transaction reference is required for UPI, Card and Net Banking payments.';
    if (msg.includes('row-level security'))      return 'You are not allowed to perform this action.';
    if (msg.includes('violates foreign key'))    return 'This record is linked to other records and cannot be changed or deleted.';
    if (msg.includes('violates check constraint')) return 'Some values are invalid. Please check the form.';
    if (msg.includes('Invalid login credentials')) return 'Incorrect email or password.';
    return msg;   // messages raised by our own triggers are already readable
}

// Show a Bootstrap alert inside an element, e.g. showMessage('msg', 'Saved!', 'success')
function showMessage(elementId, text, type = 'danger') {
    const box = document.getElementById(elementId);
    if (box) box.innerHTML = `<div class="alert alert-${type} py-2">${text}</div>`;
}

// Format a number as Indian Rupees, e.g. 150000 -> ₹1,50,000.00
function rupees(amount) {
    return '₹' + Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}
