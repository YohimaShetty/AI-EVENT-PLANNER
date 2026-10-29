/**
 * Planner engine: pure functions, no DOM. Runs in the browser and in Node (tests).
 * All money is whole rupees. Dates are "YYYY-MM-DD" strings.
 *
 * @typedef {Object} PlanInput
 * @property {'wedding'|'birthday'|'community'} type
 * @property {string} name
 * @property {string} date        Event date, YYYY-MM-DD
 * @property {number} guests      Whole number, 2 to 5000
 * @property {number} budget      Whole rupees
 * @property {string} vibe        Key of VIBES
 * @property {string[]} priorities Category keys that get a larger share
 * @property {string} notes
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Planner = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CONTINGENCY_SHARE = 0.05;
  const MAX_PRIORITIES = 3;
  const PRIORITY_BOOST = 1.35;
  const MS_PER_DAY = 86400000;
  const DAYS_PER_WEEK = 7;
  const TIER_MID_FACTOR = 2.2;
  const LIMITS = {
    guests: { min: 2, max: 5000 },
    budget: { min: 5000, max: 100000000 },
    nameLength: 80,
    notesLength: 400
  };

  const EVENT_TYPES = {
    wedding: {
      label: 'Wedding',
      minPerGuest: 1500,
      maxWeeks: 40,
      categories: [
        { key: 'venue', label: 'Venue and rooms', weight: 20 },
        { key: 'catering', label: 'Food and beverages', weight: 28 },
        { key: 'decor', label: 'Decor and flowers', weight: 10 },
        { key: 'photo', label: 'Photo and video', weight: 9 },
        { key: 'attire', label: 'Attire and jewellery', weight: 9 },
        { key: 'entertainment', label: 'Music and entertainment', weight: 6 },
        { key: 'stay', label: 'Guest stay and travel', weight: 6 },
        { key: 'stationery', label: 'Invitations and gifts', weight: 4 },
        { key: 'ceremony', label: 'Ceremony and rituals', weight: 3 }
      ]
    },
    birthday: {
      label: 'Birthday',
      minPerGuest: 500,
      maxWeeks: 12,
      categories: [
        { key: 'venue', label: 'Venue', weight: 20 },
        { key: 'catering', label: 'Food and cake', weight: 34 },
        { key: 'decor', label: 'Decor and balloons', weight: 14 },
        { key: 'entertainment', label: 'Games and entertainment', weight: 14 },
        { key: 'gifts', label: 'Return gifts', weight: 8 },
        { key: 'photo', label: 'Photos', weight: 6 },
        { key: 'stationery', label: 'Invitations', weight: 4 }
      ]
    },
    community: {
      label: 'Community event',
      minPerGuest: 150,
      maxWeeks: 10,
      categories: [
        { key: 'venue', label: 'Ground or hall hire', weight: 15 },
        { key: 'catering', label: 'Food and water', weight: 26 },
        { key: 'av', label: 'Stage, sound and lights', weight: 14 },
        { key: 'permits', label: 'Permits and safety', weight: 9 },
        { key: 'decor', label: 'Decor and signage', weight: 8 },
        { key: 'publicity', label: 'Publicity', weight: 10 },
        { key: 'entertainment', label: 'Performances and activities', weight: 12 },
        { key: 'volunteers', label: 'Volunteer supplies', weight: 6 }
      ]
    }
  };

  const TIMELINES = {
    wedding: [
      [40, 'Fix the budget and a first guest list', 'Planning'],
      [36, 'Choose the date and muhurtham with family and priest', 'Ceremony'],
      [34, 'Book the venue and nearby rooms', 'Venue'],
      [30, 'Book photographer and videographer', 'Photo'],
      [26, 'Shortlist caterers and hold a tasting', 'Catering'],
      [24, 'Order outfits and start jewellery', 'Attire'],
      [20, 'Design invitations and send save-the-dates', 'Stationery'],
      [16, 'Book decorator and music or live acts', 'Decor'],
      [12, 'Send invitations and block rooms for guests', 'Guests'],
      [8, 'Finalise the menu and confirm the ritual schedule', 'Catering'],
      [6, 'Chase RSVPs and draft seating and room plan', 'Guests'],
      [4, 'Final fittings and trial for makeup and hair', 'Attire'],
      [2, 'Confirm every vendor in writing and pay advances', 'Vendors'],
      [1, 'Share the hour-by-hour schedule with family and vendors', 'Planning'],
      [0, 'Wedding day: assign one person to handle vendor calls', 'Event day'],
      [-1, 'Settle balances, collect gifts list, send thank-you notes', 'After']
    ],
    birthday: [
      [12, 'Set the budget and a guest list', 'Planning'],
      [10, 'Pick a theme and book the venue', 'Venue'],
      [8, 'Order the cake and shortlist caterers', 'Catering'],
      [6, 'Book the entertainer or plan the games', 'Entertainment'],
      [5, 'Send invitations', 'Stationery'],
      [3, 'Order decor and return gifts', 'Decor'],
      [2, 'Confirm RSVPs and food counts', 'Guests'],
      [1, 'Confirm every vendor and prepare the schedule', 'Vendors'],
      [0, 'Party day: set up two hours early', 'Event day'],
      [-1, 'Pay balances and send thank-you messages', 'After']
    ],
    community: [
      [10, 'Agree the goal, budget and organising committee', 'Planning'],
      [9, 'Apply for permits and police intimation', 'Permits'],
      [8, 'Book the ground or hall and check the power supply', 'Venue'],
      [7, 'Invite performers, speakers and sponsors', 'Programme'],
      [6, 'Start publicity on posters, WhatsApp groups and local press', 'Publicity'],
      [5, 'Book sound, stage and lighting', 'AV'],
      [4, 'Recruit volunteers and assign leads for each area', 'Volunteers'],
      [3, 'Finalise food, water and first aid arrangements', 'Safety'],
      [2, 'Confirm every vendor and share the programme schedule', 'Vendors'],
      [1, 'Walk the site and brief volunteers', 'Safety'],
      [0, 'Event day: start setup four hours early', 'Event day'],
      [-1, 'Settle accounts, thank volunteers and sponsors', 'After']
    ]
  };

  const VENDORS = {
    wedding: [
      ['venue', 'Venue or kalyana mantapa', ['Is the hall free for setup the day before?', 'What are the power backup and parking arrangements?', 'What is the refund policy if the date changes?']],
      ['catering', 'Caterer', ['Can we taste the full menu before booking?', 'What is the per-plate price including service staff?', 'How do you handle a 10 percent rise in guest count?']],
      ['decor', 'Decorator and florist', ['Can you show past work at a similar venue?', 'Who removes the decor after the event?']],
      ['photo', 'Photographer and videographer', ['How many hours and how many photographers?', 'When will we get the edited album?']],
      ['attire', 'Tailor, boutique and jeweller', ['What are the fitting dates?', 'What is the alteration cost after delivery?']],
      ['entertainment', 'Music, DJ or live band', ['Do you bring your own sound system?', 'What is the overtime rate?']],
      ['stay', 'Guest rooms and transport', ['How many rooms can be blocked at a group rate?', 'Are airport or station pickups included?']],
      ['stationery', 'Printer for invitations', ['What is the proof and delivery schedule?']],
      ['ceremony', 'Priest and ritual items', ['Can you share the full list of items needed?', 'How long is each ritual?']]
    ],
    birthday: [
      ['venue', 'Venue or party hall', ['What is the booking time including setup?', 'Is outside food allowed?']],
      ['catering', 'Caterer and baker', ['Can the cake be made without egg or nuts if needed?', 'What is the minimum order?']],
      ['decor', 'Decorator', ['What does the theme package include?']],
      ['entertainment', 'Entertainer or game host', ['How long is the act and what age group is it for?']],
      ['gifts', 'Return gifts supplier', ['What is the price at 30 pieces and at 50 pieces?']],
      ['photo', 'Photographer', ['Is a short video reel included?']],
      ['stationery', 'Invitation designer', ['Can you deliver a shareable image the same day?']]
    ],
    community: [
      ['venue', 'Ground or community hall', ['Is a written permission letter provided?', 'What are the closing time and noise limits?']],
      ['catering', 'Caterer and water supply', ['Can you serve at the expected peak without queues?', 'Do you provide disposal for waste?']],
      ['av', 'Sound, stage and lights', ['Is there a generator for power cuts?', 'Who stays on site for the whole event?']],
      ['permits', 'Permits, police and fire clearance', ['Which offices need an application and how many days do they take?']],
      ['decor', 'Banners and signage printer', ['What is the print turnaround?']],
      ['publicity', 'Poster, social media and local press', ['Which channels reach our neighbourhood best?']],
      ['entertainment', 'Performers and activity leads', ['What is the performance length and green room need?']],
      ['volunteers', 'Volunteer kits and first aid', ['Is a first aid kit and a trained person present?']]
    ]
  };

  const VIBES = {
    traditional: 'Traditional',
    modern: 'Modern and minimal',
    outdoor: 'Outdoor and relaxed',
    playful: 'Playful and colourful'
  };

  const THEMES = {
    wedding: {
      traditional: ['Marigold and mango-leaf toranas with brass lamps', 'Silk and temple-border palette in maroon and gold', 'Banana-leaf feast with live nadaswaram'],
      modern: ['Ivory and sage with a single statement floral arch', 'Candlelit reception with a short curated menu', 'A one-page schedule shared by QR code'],
      outdoor: ['Garden ceremony at golden hour with cane seating', 'Open-air lunch with long shared tables', 'Folk music and a bonfire evening'],
      playful: ['Haldi with colour-powder photo corner', 'Sangeet with family dance acts and a quiz', 'Bright jaali lanterns and a chaat counter']
    },
    birthday: {
      traditional: ['Rangoli entrance and a puja before cake cutting', 'Home-style menu with a mithai counter', 'Memory wall with childhood photos'],
      modern: ['Single-colour balloon wall and a dessert table', 'Playlist voted by guests', 'Instant photo booth with props'],
      outdoor: ['Terrace or lawn picnic with floor seating', 'Treasure hunt around the garden', 'Evening movie on a projector'],
      playful: ['Superhero or space mission theme with costumes', 'Games station rotation in teams', 'DIY craft table instead of a hired act']
    },
    community: {
      traditional: ['Cultural evening with local folk groups', 'Rangoli and lamp competition for families', 'Shared community meal served seated'],
      modern: ['Neighbourhood fair with stalls and a talent stage', 'Digital RSVP with a live volunteer sign-up sheet', 'Zero-waste setup with steel plates and compost bins'],
      outdoor: ['Sunrise walk followed by a breakfast gathering', 'Sports day with mixed-age teams', 'Open-air film night on a screen'],
      playful: ['Children-led parade and art wall', 'Food-stall challenge with votes', 'Games for every age group in zones']
    }
  };

  const ACTIVITIES = {
    wedding: ['A welcome kit with a printed schedule and local map', 'A guest book corner with instant prints', 'Separate quiet seating for elders near the stage', 'A kids table with an activity pack'],
    birthday: ['A timed schedule with a short quiet break after games', 'Name tags with a fun fact', 'A thank-you table where guests write a wish', 'A photo timeline of the year'],
    community: ['Clear signs at entry, food and first aid', 'A lost-and-found desk', 'Volunteer bibs with names', 'A feedback box and a short form for next time']
  };

  const FOOD_NOTES = {
    low: 'Choose one main course and two sides. Fewer dishes served well beat a long menu served slowly.',
    mid: 'Offer one live counter (dosa, chaat or chaat-style snacks) next to a set menu for variety.',
    high: 'Add a tasting-style starter round and a dessert counter with regional sweets.'
  };

  const SAVINGS = {
    low: ['Hold the event on a weekday or at lunchtime for lower venue rates', 'Print one shareable invitation and send it by phone', 'Borrow decor from family and buy only flowers fresh'],
    mid: ['Ask for a package price that bundles venue, tables and power', 'Book the two biggest vendors first to lock the price', 'Skip a separate videographer and ask the photographer for a reel'],
    high: ['Spend the extra on food quality and photography, which guests remember', 'Keep the contingency untouched until the final week', 'Negotiate payment in three parts tied to delivery']
  };

  // ---------- helpers ----------

  /** Parse YYYY-MM-DD into a local Date at noon, or null if invalid (for example 30 February). */
  function parseDate(str) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ''));
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    const dt = new Date(y, mo - 1, d, 12, 0, 0, 0);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return dt;
  }

  /** Format a Date as YYYY-MM-DD in local time. */
  function toISO(dt) {
    const p = (n) => String(n).padStart(2, '0');
    return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
  }

  /** Return a new Date that is `days` after `dt` (negative goes back). */
  function addDays(dt, days) {
    const c = new Date(dt.getTime());
    c.setDate(c.getDate() + days);
    return c;
  }

  /** Whole days from `a` to `b`. */
  function daysBetween(a, b) {
    return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
  }

  /** Format a number as rupees with Indian digit grouping, for example ₹15,00,000. */
  function formatINR(n) {
    const v = Math.round(Number(n) || 0);
    return '₹' + v.toLocaleString('en-IN');
  }

  /** Format YYYY-MM-DD for display, for example 14 Mar 2027. */
  function formatDate(iso) {
    const dt = parseDate(iso);
    if (!dt) return '';
    return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /** Classify budget per guest as 'low', 'mid' or 'high' for the event type. */
  function tierFor(type, perHead) {
    const min = EVENT_TYPES[type].minPerGuest;
    if (perHead < min) return 'low';
    if (perHead < min * TIER_MID_FACTOR) return 'mid';
    return 'high';
  }

  // ---------- validation ----------

  /**
   * Check form input. Returns field errors, plus warnings for a thin budget or a close date.
   * @param {PlanInput} input
   * @param {string} today YYYY-MM-DD
   * @returns {{ok: boolean, errors: Object<string,string>, warnings: string[]}}
   */
  function validateInput(input, today) {
    const errors = {};
    const warnings = [];
    const type = input.type;
    if (!EVENT_TYPES[type]) errors.type = 'Choose an event type.';

    if (!String(input.name || '').trim()) errors.name = 'Enter a name for the event.';
    else if (String(input.name).length > LIMITS.nameLength) errors.name = 'Use ' + LIMITS.nameLength + ' characters or fewer.';

    const date = parseDate(input.date);
    const todayDt = today ? parseDate(today) : null;
    if (!date) errors.date = 'Enter a valid date.';
    else if (todayDt && date < todayDt) errors.date = 'Choose today or a future date.';

    const guests = Number(input.guests);
    if (!Number.isInteger(guests) || guests < LIMITS.guests.min || guests > LIMITS.guests.max) {
      errors.guests = 'Enter a whole number from ' + LIMITS.guests.min + ' to ' + LIMITS.guests.max + '.';
    }

    const budget = Number(input.budget);
    if (!Number.isInteger(budget) || budget < LIMITS.budget.min || budget > LIMITS.budget.max) {
      errors.budget = 'Enter a whole rupee amount from 5,000 to 10,00,00,000.';
    }

    const ok = Object.keys(errors).length === 0;
    if (ok) {
      const perHead = budget / guests;
      const min = EVENT_TYPES[type].minPerGuest;
      if (perHead < min) {
        warnings.push('Your budget is ' + formatINR(perHead) + ' per guest. Events like this usually need at least ' + formatINR(min) + '. Consider fewer guests or a simpler plan.');
      }
      if (todayDt) {
        const days = daysBetween(todayDt, date);
        if (days < EVENT_TYPES[type].maxWeeks * DAYS_PER_WEEK) {
          warnings.push('Only ' + days + ' day' + (days === 1 ? '' : 's') + ' remain, so the timeline has been compressed. Book the venue and caterer first.');
        }
      }
    }
    return { ok, errors, warnings };
  }

  // ---------- budget ----------

  /**
   * Split the budget across categories. A 5% contingency is held back, priority categories
   * get a larger weight, and largest-remainder rounding makes the lines sum exactly to the budget.
   */
  function allocateBudget(type, budget, priorities) {
    const cfg = EVENT_TYPES[type];
    const picked = new Set((priorities || []).slice(0, MAX_PRIORITIES));
    const contingency = Math.round(budget * CONTINGENCY_SHARE);
    const pool = budget - contingency;

    const weights = cfg.categories.map((c) => c.weight * (picked.has(c.key) ? PRIORITY_BOOST : 1));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const exact = weights.map((w) => (pool * w) / totalWeight);
    const floors = exact.map(Math.floor);
    let remainder = pool - floors.reduce((a, b) => a + b, 0);

    // largest remainder so the lines add up to the budget exactly
    const order = exact
      .map((v, i) => ({ i, frac: v - Math.floor(v) }))
      .sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) floors[order[k].i] += 1;

    const lines = cfg.categories.map((c, i) => ({
      key: c.key,
      label: c.label,
      amount: floors[i],
      percent: Math.round((floors[i] / budget) * 1000) / 10,
      priority: picked.has(c.key)
    }));
    lines.push({ key: 'contingency', label: 'Contingency reserve', amount: contingency, percent: Math.round((contingency / budget) * 1000) / 10, priority: false });
    const total = lines.reduce((a, l) => a + l.amount, 0);
    return { lines, total };
  }

  // ---------- timeline ----------

  /**
   * Date each milestone by counting back from the event. If less time remains than the usual
   * lead time, pre-event dates are scaled down proportionally and flagged as catch-up.
   */
  function buildTimeline(type, eventDate, today) {
    const event = parseDate(eventDate);
    const now = parseDate(today);
    const template = TIMELINES[type];
    const maxWeeks = EVENT_TYPES[type].maxWeeks;
    const daysAvail = Math.max(0, daysBetween(now, event));
    const scale = Math.min(1, daysAvail / (maxWeeks * DAYS_PER_WEEK));
    const compressed = scale < 1;

    const items = template.map((row, idx) => {
      const weeks = row[0];
      let due;
      if (weeks <= 0) due = addDays(event, -weeks * DAYS_PER_WEEK);
      else due = addDays(event, -Math.round(weeks * DAYS_PER_WEEK * scale));
      if (due < now && weeks > 0) due = now;
      return {
        id: 't' + idx,
        weeksBefore: weeks,
        task: row[1],
        group: row[2],
        due: toISO(due),
        catchUp: compressed && weeks > 0
      };
    });
    items.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : b.weeksBefore - a.weeksBefore));
    return { items, compressed, daysAvailable: daysAvail };
  }

  // ---------- vendors ----------

  /** List vendors for the event type with a budget cap taken from the category amount. */
  function buildVendors(type, allocation) {
    const amounts = {};
    allocation.lines.forEach((l) => { amounts[l.key] = l.amount; });
    const rows = VENDORS[type];
    const perCategory = {};
    rows.forEach((r) => { perCategory[r[0]] = (perCategory[r[0]] || 0) + 1; });
    return rows.map((r) => ({
      id: 'v-' + r[0],
      category: r[0],
      vendor: r[1],
      questions: r[2],
      budgetCap: Math.round((amounts[r[0]] || 0) / perCategory[r[0]])
    }));
  }

  // ---------- ideas ----------

  /** Pick themes, guest touches, food advice and savings tips by style and budget tier. */
  function buildIdeas(input) {
    const perHead = input.budget / input.guests;
    const tier = tierFor(input.type, perHead);
    const vibe = THEMES[input.type][input.vibe] ? input.vibe : 'modern';
    const activities = ACTIVITIES[input.type].slice();
    if (input.guests >= 150) activities.push('Use two serving points for food to keep queues under ten minutes');
    if (input.guests <= 30) activities.push('Seat everyone at one table or in one circle so the group stays together');
    return {
      tier,
      vibe,
      themes: THEMES[input.type][vibe],
      activities,
      food: FOOD_NOTES[tier],
      savings: SAVINGS[tier]
    };
  }

  // ---------- whole plan ----------

  /** Validate the input and assemble the complete plan, or return `{ok: false, errors}`. */
  function buildPlan(input, today) {
    const check = validateInput(input, today);
    if (!check.ok) return { ok: false, errors: check.errors };
    const normalized = {
      type: input.type,
      name: String(input.name).trim(),
      date: input.date,
      guests: Number(input.guests),
      budget: Number(input.budget),
      vibe: input.vibe,
      priorities: (input.priorities || []).filter((k) => EVENT_TYPES[input.type].categories.some((c) => c.key === k)).slice(0, MAX_PRIORITIES),
      notes: String(input.notes || '').trim().slice(0, LIMITS.notesLength)
    };
    const allocation = allocateBudget(normalized.type, normalized.budget, normalized.priorities);
    const timeline = buildTimeline(normalized.type, normalized.date, today);
    return {
      ok: true,
      input: normalized,
      perHead: Math.round(normalized.budget / normalized.guests),
      daysToGo: daysBetween(parseDate(today), parseDate(normalized.date)),
      warnings: check.warnings,
      allocation,
      timeline,
      vendors: buildVendors(normalized.type, allocation),
      ideas: buildIdeas(normalized)
    };
  }

  /** Render a plan as plain text for copying, with ticked items marked [x]. */
  function planToText(plan, done) {
    const d = done || {};
    const i = plan.input;
    const out = [];
    out.push(i.name + ' (' + EVENT_TYPES[i.type].label + ')');
    out.push(formatDate(i.date) + ' | ' + i.guests + ' guests | ' + formatINR(i.budget) + ' | ' + formatINR(plan.perHead) + ' per guest');
    out.push('', 'BUDGET');
    plan.allocation.lines.forEach((l) => out.push('- ' + l.label + ': ' + formatINR(l.amount) + ' (' + l.percent + '%)'));
    out.push('', 'TIMELINE');
    plan.timeline.items.forEach((t) => out.push((d[t.id] ? '[x] ' : '[ ] ') + formatDate(t.due) + '  ' + t.task));
    out.push('', 'VENDORS');
    plan.vendors.forEach((v) => out.push((d[v.id] ? '[x] ' : '[ ] ') + v.vendor + ' (cap ' + formatINR(v.budgetCap) + ')'));
    out.push('', 'IDEAS');
    plan.ideas.themes.forEach((t) => out.push('- ' + t));
    return out.join('\n');
  }

  return {
    EVENT_TYPES, VIBES, LIMITS, MAX_PRIORITIES, CONTINGENCY_SHARE,
    parseDate, toISO, addDays, daysBetween, formatINR, formatDate, tierFor,
    validateInput, allocateBudget, buildTimeline, buildVendors, buildIdeas, buildPlan, planToText
  };
});
