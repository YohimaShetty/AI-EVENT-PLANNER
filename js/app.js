/**
 * Celebration Planner: user interface.
 * Reads the form, asks Planner (js/planner.js) for a plan, and draws it.
 * Every piece of user text is inserted with textContent, never as HTML.
 */
(() => {
  'use strict';

  const P = window.Planner;
  const STORAGE_KEY = 'celebration-planner-v1';
  const TEXT_FIELDS = ['name', 'date', 'guests', 'budget'];
  const today = P.toISO(new Date());

  const EXAMPLES = {
    wedding: { name: "Asha and Kiran's wedding", guests: 250, budget: 1500000, offset: 300, priorities: ['catering', 'photo'] },
    birthday: { name: "Aarav's 7th birthday", guests: 40, budget: 60000, offset: 100, priorities: ['entertainment'] },
    community: { name: 'Lake Road neighbourhood fair', guests: 300, budget: 150000, offset: 90, priorities: ['catering', 'av'] }
  };

  const AI_MESSAGES = {
    not_granted: 'Claude was not allowed for this page, so no ideas were requested.',
    sampling_disabled: 'Claude is not available on this account.',
    rate_limited: 'Too many requests right now. Try again in a few minutes.',
    session_expired: 'Sign in to Claude again, then try once more.',
    invalid_json: 'Claude replied in a shape this page could not read. Try again.',
    refused: 'Claude could not help with that request. Change the focus and try again.'
  };
  const AI_FALLBACK_MESSAGE = 'Something went wrong while asking Claude. Try again.';

  /** @type {{values: object|null, done: Object<string, boolean>, signature: string, example: boolean}} */
  const state = { values: null, done: {}, signature: '', example: true };
  const dirty = new Set();
  let lastPlan = null;
  let askClaudeFn = null;
  let aiController = null;

  const $ = (id) => document.getElementById(id);
  if (!document.documentElement.lang) document.documentElement.lang = 'en';

  // ---------- DOM helper ----------

  /** Create an element. Props: class, text, on<event> handlers, or plain attributes. */
  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    Object.entries(props || {}).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') el.className = value;
      else if (key === 'text') el.textContent = value;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value === true ? '' : value);
    });
    children.flat().forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      el.append(child.nodeType ? child : document.createTextNode(String(child)));
    });
    return el;
  }

  // ---------- storage ----------

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* Storage can be blocked. The page works without it. */
    }
  }

  function exampleValues(type) {
    const ex = EXAMPLES[type];
    return {
      type,
      name: ex.name,
      date: P.toISO(P.addDays(P.parseDate(today), ex.offset)),
      guests: ex.guests,
      budget: ex.budget,
      vibe: 'traditional',
      priorities: [...ex.priorities],
      notes: ''
    };
  }

  // ---------- form ----------

  function drawTypes(selected) {
    const seg = $('typeSeg');
    seg.textContent = '';
    Object.keys(P.EVENT_TYPES).forEach((key) => {
      const id = `type-${key}`;
      seg.append(
        h('input', { type: 'radio', name: 'type', id, value: key, checked: key === selected }),
        h('label', { for: id, text: P.EVENT_TYPES[key].label })
      );
    });
  }

  function drawVibes(selected) {
    const select = $('vibe');
    select.textContent = '';
    Object.entries(P.VIBES).forEach(([key, label]) => {
      select.append(h('option', { value: key, text: label, selected: key === selected }));
    });
  }

  function drawPriorities(type, selected) {
    const box = $('priorities');
    box.textContent = '';
    P.EVENT_TYPES[type].categories.forEach((category) => {
      const id = `pri-${category.key}`;
      box.append(h('label', { class: 'check', for: id },
        h('input', { type: 'checkbox', id, value: category.key, checked: selected.includes(category.key) }),
        h('span', { text: category.label })));
    });
    limitPriorities();
  }

  /** Disable unticked priority boxes once the maximum is chosen, and update the hint. */
  function limitPriorities() {
    const boxes = [...$('priorities').querySelectorAll('input')];
    const chosen = boxes.filter((box) => box.checked).length;
    boxes.forEach((box) => { box.disabled = !box.checked && chosen >= P.MAX_PRIORITIES; });
    $('hint-pri').textContent = chosen >= P.MAX_PRIORITIES
      ? `You chose ${P.MAX_PRIORITIES}. Untick one to change.`
      : `Choose up to ${P.MAX_PRIORITIES}. ${chosen} chosen.`;
  }

  function fillForm(values) {
    drawTypes(values.type);
    drawVibes(values.vibe);
    $('name').value = values.name;
    $('date').value = values.date;
    $('date').min = today;
    $('guests').value = values.guests;
    $('budget').value = values.budget;
    $('notes').value = values.notes || '';
    drawPriorities(values.type, values.priorities || []);
  }

  function numberOrNaN(id) {
    return $(id).value === '' ? NaN : Number($(id).value);
  }

  function readForm() {
    const checked = document.querySelector('input[name="type"]:checked');
    return {
      type: checked ? checked.value : '',
      name: $('name').value,
      date: $('date').value,
      guests: numberOrNaN('guests'),
      budget: numberOrNaN('budget'),
      vibe: $('vibe').value,
      priorities: [...$('priorities').querySelectorAll('input:checked')].map((box) => box.value),
      notes: $('notes').value
    };
  }

  /** Show or clear the message under each field. With errors, move focus to the first bad field. */
  function showErrors(errors) {
    TEXT_FIELDS.forEach((field) => {
      const message = $(`err-${field}`);
      const input = $(field);
      const text = errors && errors[field];
      message.textContent = text || '';
      message.hidden = !text;
      if (text) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    });
    if (!errors) return;
    const first = TEXT_FIELDS.find((field) => errors[field]);
    if (first) $(first).focus();
    else if (errors.type) document.querySelector('input[name="type"]').focus();
  }

  // ---------- progress and ticking ----------

  const doneKey = (plan, id) => `${plan.input.type}:${id}`;
  const isDone = (plan, id) => Boolean(state.done[doneKey(plan, id)]);

  function trackedIds(plan) {
    return [...plan.timeline.items.map((item) => item.id), ...plan.vendors.map((vendor) => vendor.id)];
  }

  function updateProgress() {
    const bar = $('prog');
    if (!lastPlan || !bar) return;
    const ids = trackedIds(lastPlan);
    const finished = ids.filter((id) => isDone(lastPlan, id)).length;
    bar.max = ids.length;
    bar.value = finished;
    $('progText').textContent = `${finished} of ${ids.length} steps done`;
  }

  function onTick(plan, id) {
    return (event) => {
      state.done[doneKey(plan, id)] = event.target.checked;
      saveState();
      updateProgress();
    };
  }

  // ---------- rendering ----------

  function card(id, title, ...children) {
    return h('section', { class: 'card', id, 'aria-labelledby': `${id}-h` },
      h('h2', { id: `${id}-h`, text: title }), ...children);
  }

  function renderSummary(plan) {
    const { input } = plan;
    const countdown = plan.daysToGo === 0 ? 'Today' : `${plan.daysToGo} ${plan.daysToGo === 1 ? 'day' : 'days'} to go`;
    const fact = (label, value) => h('div', null, h('dt', { text: label }), h('dd', { text: value }));
    const link = (hash, text) => h('a', { href: hash, text });
    return h('section', { class: 'card', 'aria-labelledby': 'plan-h' },
      h('h2', { id: 'plan-h', text: input.name }),
      state.example && h('p', { class: 'example', text: 'This is an example plan. Change the details on the left and choose Build my plan.' }),
      h('dl', { class: 'facts' },
        fact('Date', P.formatDate(input.date)),
        fact('Countdown', countdown),
        fact('Guests', String(input.guests)),
        fact('Budget', P.formatINR(input.budget)),
        fact('Per guest', P.formatINR(plan.perHead))),
      plan.warnings.length > 0 && h('ul', { class: 'notice' }, plan.warnings.map((warning) => h('li', { text: warning }))),
      h('nav', { 'aria-label': 'Plan sections' }, h('div', { class: 'jump' },
        link('#sec-budget-h', 'Budget'), link('#sec-timeline-h', 'Timeline'), link('#sec-vendors-h', 'Vendors'), link('#sec-ideas-h', 'Ideas'))),
      h('div', { class: 'pbar' },
        h('label', { for: 'prog', id: 'progText' }),
        h('progress', { id: 'prog', max: 1, value: 0 })));
  }

  function renderBudget(plan) {
    const { lines, total } = plan.allocation;
    const maxPercent = Math.max(...lines.map((line) => line.percent));
    const rows = lines.map((line) => h('tr', null,
      h('th', { scope: 'row', text: line.label }, line.priority && h('span', { class: 'tag gold', text: 'Priority' })),
      h('td', { class: 'num', text: `${line.percent}%` }),
      h('td', { class: 'num', text: P.formatINR(line.amount) }),
      h('td', { class: 'bar-col', 'aria-hidden': 'true' }, h('div', { class: 'track' },
        h('div', { class: `fill${line.priority ? ' pri' : ''}`, style: `width:${Math.round((line.percent / maxPercent) * 100)}%` })))));
    return card('sec-budget', 'Budget split', h('table', null,
      h('caption', { text: 'Where each rupee goes, including a 5% reserve for surprises' }),
      h('thead', null, h('tr', null,
        h('th', { scope: 'col', text: 'Category' }),
        h('th', { scope: 'col', class: 'num', text: 'Share' }),
        h('th', { scope: 'col', class: 'num', text: 'Amount' }),
        h('td', { class: 'bar-col', 'aria-hidden': 'true' }))),
      h('tbody', null, rows),
      h('tfoot', null, h('tr', null,
        h('th', { scope: 'row', text: 'Total' }),
        h('td', { class: 'num', text: '100%' }),
        h('td', { class: 'num', text: P.formatINR(total) }),
        h('td', { class: 'bar-col', 'aria-hidden': 'true' })))));
  }

  function relativeLabel(weeksBefore) {
    if (weeksBefore > 0) return `${weeksBefore} ${weeksBefore === 1 ? 'week' : 'weeks'} before`;
    return weeksBefore === 0 ? 'Event day' : 'After the event';
  }

  function renderTimeline(plan) {
    const steps = plan.timeline.items.map((item) => {
      const id = `chk-${item.id}`;
      return h('li', { class: 'step' },
        h('input', { type: 'checkbox', id, checked: isDone(plan, item.id), onchange: onTick(plan, item.id) }),
        h('label', { for: id },
          h('span', { class: 'what', text: item.task }),
          h('span', { class: 'when' },
            `${P.formatDate(item.due)} · ${relativeLabel(item.weeksBefore)} · ${item.group}`,
            item.catchUp && h('span', { class: 'tag', text: 'Catch-up' }))));
    });
    return card('sec-timeline', 'Timeline',
      plan.timeline.compressed && h('p', { class: 'hint', text: 'Dates are squeezed to fit the time you have. Items tagged Catch-up are due sooner than usual.' }),
      h('ol', { class: 'steps' }, steps));
  }

  function renderVendors(plan) {
    const vendors = plan.vendors.map((vendor) => {
      const id = `chk-${vendor.id}`;
      return h('li', { class: 'vendor' },
        h('h3', { text: vendor.vendor }),
        h('p', { class: 'cap', text: `Budget cap ${P.formatINR(vendor.budgetCap)}` }),
        h('p', { class: 'hint', text: 'Ask them:' }),
        h('ul', null, vendor.questions.map((question) => h('li', { text: question }))),
        h('label', { class: 'check', for: id },
          h('input', { type: 'checkbox', id, checked: isDone(plan, vendor.id), onchange: onTick(plan, vendor.id) }),
          h('span', { text: 'Booked and confirmed in writing' })));
    });
    return card('sec-vendors', 'Vendor checklist', h('ul', { class: 'vendors' }, vendors));
  }

  function renderIdeas(plan) {
    const { ideas, input } = plan;
    const list = (items) => h('ul', null, items.map((item) => h('li', { text: item })));
    return card('sec-ideas', 'Ideas for your guests',
      input.notes && h('p', null, h('strong', { text: 'Your note: ' }), input.notes),
      h('div', { class: 'ideas' },
        h('div', null, h('h3', { text: `${P.VIBES[ideas.vibe]} themes` }), list(ideas.themes)),
        h('div', null, h('h3', { text: 'Touches guests remember' }), list(ideas.activities)),
        h('div', null, h('h3', { text: 'Food' }), h('p', { text: ideas.food })),
        h('div', null, h('h3', { text: 'Stretch your budget' }), list(ideas.savings))));
  }

  /** The Claude section is hidden unless the page runs inside Claude and can ask it. */
  function renderAiSection() {
    return h('section', { class: 'card', id: 'sec-ai', hidden: !askClaudeFn, 'aria-labelledby': 'sec-ai-h' },
      h('h2', { id: 'sec-ai-h', text: 'More ideas from Claude' }),
      h('p', { class: 'hint', text: 'Claude reads your plan and suggests six extra ideas. It uses your own Claude account and asks your permission first.' }),
      h('div', { class: 'field' },
        h('label', { class: 'lbl', for: 'aiAsk', text: 'What should the ideas focus on? (optional)' }),
        h('input', { type: 'text', id: 'aiAsk', maxlength: '160', autocomplete: 'off' })),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', id: 'aiGo', onclick: askClaude, text: 'Suggest ideas' }),
        h('button', { type: 'button', class: 'btn ghost', id: 'aiStop', hidden: true, onclick: () => aiController && aiController.abort(), text: 'Stop' })),
      h('div', { class: 'ai-out', id: 'aiOut', 'aria-live': 'polite' }));
  }

  function render(plan) {
    lastPlan = plan;
    const out = $('out');
    out.textContent = '';
    out.append(h('div', { class: 'plan' },
      renderSummary(plan),
      renderBudget(plan),
      renderTimeline(plan),
      renderVendors(plan),
      renderIdeas(plan),
      renderAiSection(),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn ghost', id: 'copy', onclick: copyPlan, text: 'Copy plan as text' })),
      h('div', { id: 'copyArea' })));
    updateProgress();
  }

  /** Validate the form and draw the plan. Returns true on success. */
  function build(announce) {
    const plan = P.buildPlan(readForm(), today);
    if (!plan.ok) {
      showErrors(plan.errors);
      $('status').textContent = 'Please fix the highlighted fields.';
      return false;
    }
    showErrors(null);
    const signature = [plan.input.type, plan.input.name, plan.input.date].join('|');
    if (signature !== state.signature) {
      state.done = {};
      state.signature = signature;
    }
    state.values = plan.input;
    render(plan);
    saveState();
    if (announce) $('status').textContent = `Plan updated for ${plan.input.name}.`;
    return true;
  }

  // ---------- copy ----------

  function tickedIdsFor(plan) {
    const prefix = `${plan.input.type}:`;
    return Object.fromEntries(Object.keys(state.done)
      .filter((key) => state.done[key] && key.startsWith(prefix))
      .map((key) => [key.slice(prefix.length), true]));
  }

  function showCopyFallback(text) {
    const area = $('copyArea');
    area.textContent = '';
    const box = h('textarea', { class: 'copybox', id: 'copyBox', readonly: true, 'aria-label': 'Plan text. Select all and copy.' });
    box.value = text;
    area.append(box);
    box.focus();
    box.select();
    $('status').textContent = 'Select the text and copy it.';
  }

  function copyPlan() {
    if (!lastPlan) return;
    const text = P.planToText(lastPlan, tickedIdsFor(lastPlan));
    const confirmCopied = () => {
      $('status').textContent = 'Plan copied.';
      $('copy').textContent = 'Copied';
      setTimeout(() => { const button = $('copy'); if (button) button.textContent = 'Copy plan as text'; }, 2000);
    };
    if (!navigator.clipboard) { showCopyFallback(text); return; }
    navigator.clipboard.writeText(text).then(confirmCopied, () => showCopyFallback(text));
  }

  // ---------- optional: ask Claude (only when running inside Claude) ----------

  function buildAiPrompt(plan, focus) {
    const { input } = plan;
    return [
      'You help families plan celebrations in India. Suggest exactly 6 fresh, practical ideas for this event that are NOT already in the plan.',
      '',
      `Event: ${P.EVENT_TYPES[input.type].label} called "${input.name}"`,
      `Date: ${input.date}`,
      `Guests: ${input.guests}`,
      `Budget: ${P.formatINR(input.budget)} (${P.formatINR(plan.perHead)} per guest)`,
      `Style: ${P.VIBES[input.vibe]}`,
      `Extra money goes to: ${input.priorities.join(', ') || 'no preference'}`,
      `Special requests: ${input.notes || 'none'}`,
      `Focus: ${focus || 'anything useful'}`,
      `Ideas already in the plan: ${plan.ideas.themes.join('; ')}`,
      '',
      'Each idea must fit the budget per guest and be doable by a small family team.',
      'Reply with only a JSON array of 6 objects like {"title":"short title","detail":"one or two sentences with a concrete tip"}.'
    ].join('\n');
  }

  function showAiIdeas(out, items) {
    out.textContent = '';
    const list = Array.isArray(items) ? items.slice(0, 6) : [];
    if (list.length === 0) { out.textContent = 'No ideas came back. Try again.'; return; }
    list.forEach((item) => {
      out.append(h('div', { class: 'ai-item' },
        h('h3', { text: String((item && item.title) || 'Idea') }),
        h('p', { text: String((item && item.detail) || '') })));
    });
  }

  function askClaude() {
    if (!askClaudeFn || !lastPlan) return;
    const go = $('aiGo');
    const stop = $('aiStop');
    const out = $('aiOut');
    aiController = new AbortController();
    go.disabled = true;
    stop.hidden = false;
    out.textContent = 'Thinking...';
    askClaudeFn.json(buildAiPrompt(lastPlan, $('aiAsk').value.trim()), { modelTier: 'quick', signal: aiController.signal, cache: false })
      .then((items) => showAiIdeas(out, items))
      .catch((error) => {
        out.textContent = error && error.code === 'cancelled' ? 'Stopped.' : (AI_MESSAGES[error && error.code] || AI_FALLBACK_MESSAGE);
      })
      .finally(() => { go.disabled = false; stop.hidden = true; aiController = null; });
  }

  function initClaude() {
    if (!window.claude || typeof window.claude.use !== 'function') return;
    Promise.resolve(window.claude.use('sample')).then((fn) => {
      if (!fn) return;
      askClaudeFn = fn;
      const section = $('sec-ai');
      if (section) section.hidden = false;
    }).catch(() => { /* not available: the page works without it */ });
  }

  // ---------- events ----------

  function onTypeChange(type) {
    const example = exampleValues(type);
    TEXT_FIELDS.forEach((field) => { if (!dirty.has(field)) $(field).value = example[field]; });
    drawPriorities(type, dirty.has('priorities') ? [] : example.priorities);
  }

  function onSubmit(event) {
    event.preventDefault();
    state.example = false;
    if (!build(true)) return;
    const plan = $('plan');
    plan.focus({ preventScroll: true });
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    plan.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  function onReset() {
    dirty.clear();
    Object.assign(state, { values: null, done: {}, signature: '', example: true });
    showErrors(null);
    fillForm(exampleValues('wedding'));
    build(true);
    $('status').textContent = 'Reset to the example wedding.';
  }

  function bindEvents() {
    const form = $('form');
    form.addEventListener('submit', onSubmit);
    form.addEventListener('input', (event) => {
      if (event.target.id && event.isTrusted) dirty.add(event.target.id);
    });
    form.addEventListener('change', (event) => {
      const target = event.target;
      if (target.name === 'type') onTypeChange(target.value);
      else if (target.closest('#priorities')) { dirty.add('priorities'); limitPriorities(); }
    });
    $('reset').addEventListener('click', onReset);
  }

  // ---------- start ----------

  function start() {
    const saved = loadState();
    let initial = exampleValues('wedding');
    if (saved && saved.values && P.validateInput(saved.values, today).ok) {
      Object.assign(state, { values: saved.values, done: saved.done || {}, signature: saved.signature || '', example: Boolean(saved.example) });
      initial = saved.values;
    }
    fillForm(initial);
    bindEvents();
    build(false);
    initClaude();
  }

  start();
})();
