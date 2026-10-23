// =====================================================================
// js/icons.js  -  thin ivory line-art icons for the Wedora timeline
// Hand-drawn SVGs (no icon library needed). They use "currentColor",
// so they take the text colour set in css/wedora.css.
// =====================================================================

const ICON_ATTRS = 'viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

const ICONS = {
    // Camera with a heart (Get Dressed & Portraits)
    camera: `<svg ${ICON_ATTRS}>
        <rect x="7" y="20" width="50" height="33" rx="8"/>
        <path d="M22 20l4-7h12l4 7"/>
        <path d="M40 13c3-4 9-4 11 0"/>
        <path d="M32 46c-9-6-11-12-7-15 3-2 5.5-.5 7 2 1.5-2.5 4-4 7-2 4 3 2 9-7 15z"/>
    </svg>`,

    // Compact mirror, brush and sparkle (Hair & Makeup)
    makeup: `<svg ${ICON_ATTRS}>
        <rect x="11" y="44" width="30" height="10" rx="2"/>
        <circle cx="26" cy="31" r="12"/>
        <circle cx="26" cy="31" r="8.5"/>
        <path d="M22 29l4-4M22.5 34l7-7"/>
        <path d="M6 44V30a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14"/>
        <path d="M47 17c1-6 7-9 10-6s0 9-6 10z"/>
        <path d="M49 20l-1 34h4l1-31"/>
        <path d="M37 6v8M33 10h8"/>
    </svg>`,

    // Couple embracing (First Looks & Guest Arrival)
    couple: `<svg ${ICON_ATTRS}>
        <circle cx="25" cy="15" r="7"/>
        <circle cx="39" cy="13" r="7"/>
        <path d="M17 58V38c0-7 4-13 10-14"/>
        <path d="M46 58V35c0-6-2-11-6-13"/>
        <path d="M18 36c7 1 16 1 26-4"/>
        <path d="M22 42c7 2 15 1 23-4"/>
        <path d="M31 58V44"/>
    </svg>`,

    // Two wedding rings with a diamond (Ceremony)
    rings: `<svg ${ICON_ATTRS}>
        <circle cx="25" cy="41" r="13"/>
        <circle cx="25" cy="41" r="9.5"/>
        <circle cx="40" cy="41" r="13"/>
        <circle cx="40" cy="41" r="9.5"/>
        <path d="M19 22l3.5-4h7l3.5 4-7 6.5z"/>
        <path d="M19 22h14"/>
        <path d="M26 7v4M17 10l2.5 2.5M35 10l-2.5 2.5"/>
    </svg>`,

    // Cocktail glass with straw and fruit (Cocktail Hour)
    cocktail: `<svg ${ICON_ATTRS}>
        <path d="M21 16h22l-3 19c-1 6-4 9-8 9s-7-3-8-9z"/>
        <path d="M23 27h18"/>
        <path d="M32 44v12M24 57h16"/>
        <path d="M29 16L23 4"/>
        <circle cx="43" cy="13" r="4"/>
        <path d="M40 6l7-3 1 4"/>
    </svg>`,

    // Plate with fork and knife (Speeches & Wedding Breakfast)
    plate: `<svg ${ICON_ATTRS}>
        <circle cx="32" cy="34" r="15"/>
        <circle cx="32" cy="34" r="10"/>
        <path d="M8 12v10c0 3 2 4 3.5 4S15 25 15 22V12"/>
        <path d="M11.5 12v10M11.5 26v30"/>
        <path d="M56 12c-4 4-5 10-5 16h5v28"/>
    </svg>`,

    // Beamed music notes (After Dinner & Evening)
    music: `<svg ${ICON_ATTRS}>
        <path d="M24 47V18l22-7v29"/>
        <path d="M24 25l22-7"/>
        <ellipse cx="18.5" cy="47" rx="5.5" ry="4.5"/>
        <ellipse cx="40.5" cy="40" rx="5.5" ry="4.5"/>
    </svg>`,

    // Three-tier wedding cake (Cake & First Dance)
    cake: `<svg ${ICON_ATTRS}>
        <rect x="23" y="19" width="18" height="9" rx="1.5"/>
        <rect x="17" y="28" width="30" height="11" rx="1.5"/>
        <rect x="11" y="39" width="42" height="12" rx="1.5"/>
        <path d="M17 32c3 2 5 2 7.5 0s5-2 7.5 0 5 2 7.5 0 5-2 7.5 0"/>
        <path d="M11 44c3.5 2 6 2 8.5 0s6-2 8.5 0 6 2 8.5 0 6-2 8.5 0 5 2 8 0"/>
        <path d="M7 51h50M20 56h24"/>
        <path d="M32 19v-5"/>
        <circle cx="32" cy="11.5" r="2.5"/>
    </svg>`,

    // ---------------- Indian wedding ceremonies ----------------

    // Hand with a mehendi mandala (Mehendi)
    henna: `<svg ${ICON_ATTRS}>
        <path d="M23 36V13a3 3 0 0 1 6 0v17"/>
        <path d="M29 30V9a3 3 0 0 1 6 0v21"/>
        <path d="M35 30V11a3 3 0 0 1 6 0v21"/>
        <path d="M41 32V17a3 3 0 0 1 6 0v21c0 11-6 18-15 18h-2c-6 0-9-3-12-8l-8-12a3 3 0 0 1 5-4l5 6"/>
        <circle cx="35" cy="43" r="4"/>
        <circle cx="35" cy="43" r="7.5" stroke-dasharray="1.5 2.5"/>
        <path d="M26 15h0M32 11h0M38 13h0M44 19h0" stroke-width="2.4"/>
        <path d="M27 58v4M43 55v7"/>
    </svg>`,

    // Bowl of turmeric with marigolds (Haldi)
    haldi: `<svg ${ICON_ATTRS}>
        <path d="M10 34h44c0 11-10 19-22 19S10 45 10 34z"/>
        <path d="M17 34c3-9 27-9 30 0"/>
        <path d="M24 53l-2 5h20l-2-5"/>
        <path d="M14 41h36" stroke-dasharray="2 3"/>
        <circle cx="52" cy="17" r="5"/><circle cx="52" cy="17" r="2"/>
        <circle cx="12" cy="19" r="4"/><circle cx="12" cy="19" r="1.5"/>
        <path d="M32 24v-9M28 18l4-4 4 4"/>
    </svg>`,

    // Dhol drum with ropes and strap (Sangeet)
    dhol: `<svg ${ICON_ATTRS}>
        <ellipse cx="15" cy="36" rx="5" ry="14"/>
        <ellipse cx="49" cy="36" rx="5" ry="14"/>
        <path d="M15 22h34M15 50h34"/>
        <path d="M17 23l6 26 6-26 6 26 6-26 6 26"/>
        <path d="M15 22C20 8 44 8 49 22"/>
        <path d="M52 52l7 7M5 52l-1 7"/>
    </svg>`,

    // Mandap with canopy, pillars and garlands (Mandap Alankaram)
    mandap: `<svg ${ICON_ATTRS}>
        <path d="M6 26C18 12 46 12 58 26z"/>
        <path d="M32 14V7"/><circle cx="32" cy="5" r="2"/>
        <path d="M11 26v31M53 26v31M21 26v31M43 26v31"/>
        <path d="M11 31c3 6 7 6 10 0M21 31c3 6 7 6 11 0M32 31c4 6 8 6 11 0M43 31c3 6 7 6 10 0"/>
        <path d="M4 58h56"/>
        <path d="M28 58v-6h8v6"/>
    </svg>`,

    // Temple gopuram / wedding hall (Kalyana Mandapam)
    gopuram: `<svg ${ICON_ATTRS}>
        <path d="M12 58V42h40v16"/>
        <path d="M16 42v-9h32v9"/>
        <path d="M20 33v-8h24v8"/>
        <path d="M24 25v-7h16v7"/>
        <path d="M28 18v-5h8v5"/>
        <path d="M32 13V7"/><circle cx="32" cy="5" r="1.8"/>
        <path d="M27 58v-8a5 5 0 0 1 10 0v8"/>
        <path d="M6 58h52"/>
    </svg>`,

    // Kalash with coconut and mango leaves (Muhurtham)
    kalash: `<svg ${ICON_ATTRS}>
        <circle cx="32" cy="18" r="7"/>
        <path d="M26 28c-6-1-12-6-14-12 6 1 11 5 14 12z"/>
        <path d="M38 28c6-1 12-6 14-12-6 1-11 5-14 12z"/>
        <path d="M24 28h16M26 28v4h12v-4"/>
        <path d="M26 32c-9 4-12 13-7 20 2 3 5 5 9 5h8c4 0 7-2 9-5 5-7 2-16-7-20"/>
        <path d="M18 43h28"/>
        <path d="M24 47l2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2"/>
        <path d="M22 59h20"/>
    </svg>`,

    // Flower garland (Jaimala)
    garland: `<svg ${ICON_ATTRS}>
        <path d="M14 8c-4 22 6 40 18 44 12-4 22-22 18-44"/>
        <path d="M20 8c-2 16 4 30 12 34 8-4 14-18 12-34"/>
        <circle cx="16" cy="22" r="2.5"/><circle cx="19" cy="34" r="2.5"/><circle cx="25" cy="44" r="2.5"/>
        <circle cx="48" cy="22" r="2.5"/><circle cx="45" cy="34" r="2.5"/><circle cx="39" cy="44" r="2.5"/>
        <path d="M32 52v5"/><circle cx="32" cy="59.5" r="2.5"/>
    </svg>`,

    // Banana leaf meal (Vivaha Bhojanam)
    leaf: `<svg ${ICON_ATTRS}>
        <path d="M5 42C14 18 46 12 60 21 53 42 22 52 5 42z"/>
        <path d="M7 41C24 33 42 27 58 22"/>
        <path d="M18 37l-4-7M26 34l-3-9M34 31l-2-9M42 28l-1-8"/>
        <path d="M20 46c2-6 12-6 14-1"/>
        <circle cx="40" cy="38" r="3.5"/>
        <circle cx="48" cy="33" r="2.5"/>
    </svg>`,

    // small ornament placed where each connector meets the centre line
    knot: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" aria-hidden="true">
        <path d="M12 3c3 4 3 6 0 9-3-3-3-5 0-9z"/>
        <path d="M12 21c3-4 3-6 0-9-3 3-3 5 0 9z"/>
        <circle cx="12" cy="12" r="1.3"/>
    </svg>`,

    // small lotus divider under the subtitle
    lotus: `<svg viewBox="0 0 120 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" aria-hidden="true">
        <path d="M2 16h38M80 16h38"/>
        <path d="M60 4c4 4 5 8 0 13-5-5-4-9 0-13z"/>
        <path d="M60 17c-4-5-10-7-15-6 2 4 8 7 15 6zM60 17c4-5 10-7 15-6-2 4-8 7-15 6z"/>
        <path d="M60 17c-6 1-11 3-14 6M60 17c6 1 11 3 14 6"/>
        <circle cx="44" cy="16" r="1"/><circle cx="76" cy="16" r="1"/>
    </svg>`,

    back: `<svg ${ICON_ATTRS}><path d="M40 14L22 32l18 18"/></svg>`
};
