const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/planner.js');

const TODAY = '2026-10-27';
const base = { type: 'wedding', name: 'Asha and Kiran', date: '2027-03-14', guests: 250, budget: 1500000, vibe: 'traditional', priorities: ['catering'], notes: '' };

test('validateInput accepts a good wedding', () => {
  const r = P.validateInput(base, TODAY);
  assert.equal(r.ok, true);
});

test('validateInput reports each bad field', () => {
  const r = P.validateInput({ type: 'x', name: '  ', date: '2026-02-30', guests: 1, budget: 10 }, TODAY);
  assert.equal(r.ok, false);
  for (const k of ['type', 'name', 'date', 'guests', 'budget']) assert.ok(r.errors[k], k);
});

test('validateInput rejects past dates and fractional numbers', () => {
  assert.ok(P.validateInput({ ...base, date: '2026-10-01' }, TODAY).errors.date);
  assert.ok(P.validateInput({ ...base, guests: 10.5 }, TODAY).errors.guests);
  assert.ok(P.validateInput({ ...base, budget: 99999.5 }, TODAY).errors.budget);
});

test('validateInput accepts today as the event date', () => {
  assert.equal(P.validateInput({ ...base, date: TODAY }, TODAY).ok, true);
});

test('low budget per guest produces a warning', () => {
  const r = P.validateInput({ ...base, budget: 100000 }, TODAY);
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => /per guest/.test(w)));
});

test('allocation adds up exactly for many inputs', () => {
  for (const type of Object.keys(P.EVENT_TYPES)) {
    for (const budget of [5000, 12345, 99999, 250000, 1500001, 77777777]) {
      for (const pr of [[], ['venue'], ['catering', 'decor', 'photo', 'attire']]) {
        const a = P.allocateBudget(type, budget, pr);
        assert.equal(a.total, budget, type + ' ' + budget);
        assert.ok(a.lines.every((l) => Number.isInteger(l.amount) && l.amount >= 0));
      }
    }
  }
});

test('contingency is five percent', () => {
  const a = P.allocateBudget('birthday', 100000, []);
  assert.equal(a.lines.at(-1).key, 'contingency');
  assert.equal(a.lines.at(-1).amount, 5000);
});

test('priorities increase a category share and cap at three', () => {
  const plain = P.allocateBudget('wedding', 1000000, []);
  const boosted = P.allocateBudget('wedding', 1000000, ['photo']);
  const get = (a, k) => a.lines.find((l) => l.key === k).amount;
  assert.ok(get(boosted, 'photo') > get(plain, 'photo'));
  const many = P.allocateBudget('wedding', 1000000, ['venue', 'catering', 'decor', 'photo']);
  assert.equal(many.lines.filter((l) => l.priority).length, P.MAX_PRIORITIES);
});

test('timeline is ordered and ends after the event', () => {
  const t = P.buildTimeline('wedding', '2027-08-20', TODAY);
  const dates = t.items.map((i) => i.due);
  assert.deepEqual(dates, [...dates].sort());
  assert.ok(t.items.at(-1).due > '2027-08-20');
  assert.equal(t.compressed, false);
  assert.ok(t.items.every((i) => i.due >= TODAY));
});

test('timeline compresses when the date is close and never lands in the past', () => {
  const t = P.buildTimeline('wedding', '2026-11-10', TODAY);
  assert.equal(t.compressed, true);
  assert.ok(t.items.every((i) => i.due >= TODAY));
  const pre = t.items.filter((i) => i.weeksBefore > 0);
  assert.ok(pre.every((i) => i.due <= '2026-11-10'));
  assert.ok(pre.every((i) => i.catchUp));
});

test('event today gives a valid timeline', () => {
  const t = P.buildTimeline('birthday', TODAY, TODAY);
  assert.ok(t.items.every((i) => i.due >= TODAY));
});

test('vendor caps match category budgets', () => {
  const a = P.allocateBudget('community', 200000, []);
  const v = P.buildVendors('community', a);
  assert.equal(v.length, 8);
  for (const vendor of v) {
    const line = a.lines.find((l) => l.key === vendor.category);
    assert.ok(Math.abs(vendor.budgetCap - line.amount) <= 1);
    assert.ok(vendor.questions.length >= 1);
  }
});

test('ideas change with vibe and budget tier', () => {
  const a = P.buildIdeas({ ...base, vibe: 'outdoor' });
  const b = P.buildIdeas({ ...base, vibe: 'playful' });
  assert.notDeepEqual(a.themes, b.themes);
  assert.equal(P.buildIdeas({ ...base, budget: 100000 }).tier, 'low');
  assert.equal(P.buildIdeas({ ...base, budget: 9000000 }).tier, 'high');
  assert.ok(P.buildIdeas({ ...base, guests: 200 }).activities.some((x) => /two serving points/.test(x)));
});

test('buildPlan returns errors for bad input and a full plan for good input', () => {
  assert.equal(P.buildPlan({ ...base, guests: 0 }, TODAY).ok, false);
  const plan = P.buildPlan(base, TODAY);
  assert.equal(plan.ok, true);
  assert.equal(plan.perHead, 6000);
  assert.equal(plan.daysToGo, 138);
  assert.equal(plan.allocation.total, base.budget);
});

test('buildPlan drops priorities that do not belong to the event type', () => {
  const plan = P.buildPlan({ ...base, type: 'birthday', priorities: ['ceremony', 'decor'] }, TODAY);
  assert.deepEqual(plan.input.priorities, ['decor']);
});

test('formatINR uses Indian digit grouping', () => {
  assert.equal(P.formatINR(1500000), '₹15,00,000');
  assert.equal(P.formatINR(0), '₹0');
});

test('planToText includes ticked items', () => {
  const plan = P.buildPlan(base, TODAY);
  const txt = P.planToText(plan, { t0: true });
  assert.match(txt, /\[x\]/);
  assert.match(txt, /BUDGET/);
});
