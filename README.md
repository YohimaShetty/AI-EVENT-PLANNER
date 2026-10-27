# Celebration Planner

A planning assistant for weddings, birthdays and community events. Enter the event type, date, guest count and budget in rupees. The app returns:

- **Budget split** that adds up to the rupee, with a 5% contingency reserve and up to three priority categories that get a larger share.
- **Dated timeline** counted back from the event date. If the date is closer than the usual lead time, the dates are compressed and tagged "Catch-up".
- **Vendor checklist** with a budget cap per vendor and questions to ask each one.
- **Personalised ideas** that change with style (traditional, modern, outdoor, playful), guest count and budget per guest.
- **More ideas from Claude** (optional). When the page runs inside Claude it can ask Claude for six extra ideas, using the viewer's own account and permission. Everywhere else this section stays hidden and the rest works the same.

## Run it

No install step and no dependencies.

```bash
npm test        # 17 unit tests for the planner logic (Node 18+)
npm run build   # writes dist/index.html
```

Open `dist/index.html` in a browser, or publish the `dist` folder with GitHub Pages, Netlify or Vercel.

## Structure

| Path | Purpose |
| --- | --- |
| `src/planner.js` | Pure planning logic: validation, budget, timeline, vendors, ideas |
| `src/template.html` | Interface, styles and the code that connects it to the planner |
| `test/planner.test.js` | Unit tests (`node:test`) |
| `build.js` | Inlines the planner into one self-contained HTML file |

## Quality notes

- **Correctness:** allocation uses largest-remainder rounding, so lines always sum to the budget. Tests cover many budgets, priorities, date edge cases (today, past, 30 February) and tier thresholds.
- **Accessibility:** skip link, labelled fields, error messages tied to fields with `aria-describedby` and focus moved to the first error, native checkboxes and radios, a real table with row and column headers, a labelled progress bar, live status announcements, visible focus, 44px touch targets, light and dark themes, reduced-motion support, no sideways scrolling at 390px.
- **Security:** all user text is inserted with `textContent`; nothing is sent to a server. Checklist progress is stored only in the browser's local storage.
- **Efficiency:** one file of about 50 KB, no framework, no network requests except the font stylesheet.
