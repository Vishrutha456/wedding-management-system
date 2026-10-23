// =====================================================================
// js/timeline.js  -  draws the timeline on index.html from EVENTS
// Each ceremony becomes ONE link to event.html?e=<key>, so the circle,
// the day label and the name are all clickable.
// =====================================================================

function renderTimeline() {
    document.getElementById('lotus').innerHTML = ICONS.lotus;
    const list = document.getElementById('timeline');

    list.innerHTML = EVENTS.map(ev => {
        const text = `
            <span class="text">
                <span class="time">${ev.when}</span>
                <span class="label">${ev.title}</span>
                <span class="caption">${ev.caption}</span>
            </span>`;
        const icon = `<span class="icon medallion">${ICONS[ev.icon]}</span>`;
        const connector = `<span class="connector"></span>`;

        // left side:  TEXT (O) ——|      right side:  |—— (O) TEXT
        const inside = ev.side === 'left' ? text + icon + connector : connector + icon + text;

        return `
            <li id="ev-${ev.key}">
                <span class="knot">${ICONS.knot}</span>
                <a class="event ${ev.side}" href="event.html?e=${ev.key}"
                   title="Open ${ev.pageTitle}" aria-label="${ev.when}, ${ev.title} - open ${ev.pageTitle}">
                    ${inside}
                </a>
            </li>`;
    }).join('');
}

renderTimeline();
