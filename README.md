# Celebration Planner

A planning assistant for weddings, birthdays and community events. Enter the event type, date, guest count and budget in rupees. The app returns:

- **Budget split** that adds up to the exact rupee, with a 5% contingency reserve and up to three priority categories that get a larger share.
- **Dated timeline** counted back from the event date. If the date is closer than the usual lead time, the dates are compressed and tagged "Catch-up".
- **Vendor checklist** with a budget cap per vendor and questions to ask each one.
- **Personalised ideas** that change with style (traditional, modern, outdoor, playful), guest count and budget per guest.
- **More ideas from Claude** (optional). When the page runs inside Claude, it can ask Claude for six extra ideas using the viewer's own account and permission. Everywhere else this section stays hidden and the rest works the same.

Live site: https://yohimashetty.github.io/AI-EVENT-PLANNER/

## Run it

There is no build step. Open `index.html` in a browser, or serve the folder with any static host (GitHub Pages, Netlify, Vercel).

```bash
npm install     # installs ESLint only
npm test        # 26 unit tests for the planner logic (Node 18+)
npm run lint    # ESLint
```

## Structure

| Path | Purpose |
| --- | --- |
| `index.html` | Page markup |
| `css/styles.css` | Styles, light and dark themes |
| `js/planner.js` | Pure planning logic: validation, budget, timeline, vendors, ideas. No DOM access |
| `js/app.js` | Interface: reads the form, calls the planner, draws the result |
| `test/planner.test.js` | Unit tests (`node:test`) |
| `.github/workflows/ci.yml` | Runs lint and tests on every push |

## Design notes

- **Separation of concerns:** `planner.js` has no DOM code, so it runs in the browser and in Node and is easy to test. `app.js` only handles input and output.
- **Correctness:** allocation uses largest-remainder rounding, so lines always sum to the budget. Tests cover many budgets, priorities, leap days, invalid dates, exact limits, close dates and tier thresholds.
- **Accessibility:** skip link, every field labelled, errors tied to fields with `aria-describedby` and focus moved to the first error, a real table with headers, a labelled progress bar, live status announcements, visible focus, 44px touch targets, light and dark themes, reduced-motion support and no sideways scrolling at 390px.
- **Security:** all user text is inserted with `textContent`, never as HTML. Nothing is sent to a server. Checklist progress is stored only in the browser's local storage.
- **Efficiency:** no framework and no dependencies at run time. About 50 KB in total, with one font request.

## Licence

MIT
