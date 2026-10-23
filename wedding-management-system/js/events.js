// =====================================================================
// js/events.js  -  the Indian wedding ceremonies on the timeline,
// in the order they appear (top to bottom), and which database records
// each one opens.
//
//   side      : 'right' or 'left' of the centre line (alternating)
//   icon      : key from js/icons.js
//   when      : small label above the name (day and time of day)
//   title     : ceremony name (shown in script)
//   caption   : one-line description under the name
//   source    : what event.html loads from Supabase
//      { entity: 'booking', categories: [...] }  -> BOOKING rows whose package
//                                                   belongs to these vendor categories
//      { entity: 'wedding' | 'venue' | 'customer' } -> that table
// =====================================================================

const EVENTS = [
    {
        key: 'mehendi', side: 'right', icon: 'henna',
        when: 'Day 1 · Afternoon', title: 'Mehendi',
        caption: 'Henna, songs & laughter',
        pageTitle: 'Mehendi Bookings',
        source: { entity: 'booking', categories: ['Mehendi'] }
    },
    {
        key: 'haldi', side: 'left', icon: 'haldi',
        when: 'Day 2 · Morning', title: 'Haldi',
        caption: 'Turmeric blessings & bridal glow',
        pageTitle: 'Bridal Makeup Bookings',
        source: { entity: 'booking', categories: ['Makeup'] }
    },
    {
        key: 'sangeet', side: 'right', icon: 'dhol',
        when: 'Day 2 · Evening', title: 'Sangeet',
        caption: 'Music, dance & the dhol',
        pageTitle: 'Music & Entertainment',
        source: { entity: 'booking', categories: ['Music'] }
    },
    {
        key: 'mandap', side: 'left', icon: 'mandap',
        when: 'Day 3 · Dawn', title: 'Mandap Alankaram',
        caption: 'Flowers, drapes & the sacred mandap',
        pageTitle: 'Décor & Planning Bookings',
        source: { entity: 'booking', categories: ['Decoration', 'Wedding Planning'] }
    },
    {
        key: 'kalyana-mandapam', side: 'right', icon: 'gopuram',
        when: 'Day 3 · Morning', title: 'Kalyana Mandapam',
        caption: 'Welcoming the baraat & guests',
        pageTitle: 'Wedding Venues',
        source: { entity: 'venue' }
    },
    {
        key: 'muhurtham', side: 'left', icon: 'kalash',
        when: 'Day 3 · Auspicious hour', title: 'Muhurtham',
        caption: 'The sacred union',
        pageTitle: 'Wedding Events',
        source: { entity: 'wedding' }
    },
    {
        key: 'jaimala', side: 'right', icon: 'garland',
        when: 'Day 3 · Noon', title: 'Jaimala & Saptapadi',
        caption: 'Garlands, seven vows & portraits',
        pageTitle: 'Photography Bookings',
        source: { entity: 'booking', categories: ['Photography'] }
    },
    {
        key: 'bhojanam', side: 'left', icon: 'leaf',
        when: 'Day 3 · Afternoon', title: 'Vivaha Bhojanam',
        caption: 'The wedding feast on banana leaf',
        pageTitle: 'Catering Bookings',
        source: { entity: 'booking', categories: ['Catering'] }
    },
    {
        key: 'reception', side: 'right', icon: 'couple',
        when: 'Day 3 · Evening', title: 'Reception',
        caption: 'Celebrating the newlyweds',
        pageTitle: 'Couples & Clients',
        source: { entity: 'customer' }
    }
];
