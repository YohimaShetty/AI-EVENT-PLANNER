# Submission answers: Challenge 5, Celebration and Event Planner

## Project Deployed Link
Your published page is in the conversation card (Celebration Planner). It is private until you share it.
In the page's Share menu, allow anyone with the link to view, copy that link, and check it in a private browser window before you submit.

## Public GitHub Repository Link
Create a public repository, upload everything in this folder (`src`, `test`, `build.js`, `package.json`, `README.md`, `dist`), and paste its URL.
The repo is well under 10 MB.

## Describe the changes/updates made in the deployed version (907 characters, limit 1024)
Deployed version adds an optional AI step on top of the rule-based planner. When the page runs inside Claude, a new 'More ideas from Claude' section asks Claude for six extra ideas using the plan (type, date, guests, budget per guest, style, priorities, special requests). Other updates: budget split now always adds up to the exact rupee using largest-remainder rounding, with a 5% contingency reserve and up to three priority categories; timeline compresses and tags 'Catch-up' items when the date is close instead of showing past dates; vendor checklist shows a budget cap and questions to ask each vendor; checklist progress is saved in the browser; validation messages are linked to fields and focus moves to the first error; Copy plan as text added; accessibility fixes (skip link, labelled table, progress bar, live status, visible focus, light and dark themes); 17 unit tests for the planning logic.

## Project Demo Video Submission
Record a screen capture of 2 to 3 minutes, upload it to YouTube as Unlisted (or Drive with access given), and paste the link.
Script:

1. 0:00 Introduce. "This is Celebration Planner. It helps families plan weddings, birthdays and community events."
2. 0:15 Show the example wedding plan. Point to the date, countdown, guests, budget and cost per guest.
3. 0:35 Budget split. Say the lines add up to the exact rupee, with a 5% reserve. Tick two priorities and press Build my plan to show the shares change.
4. 1:00 Timeline. Show dates counted back from the event. Change the date to two weeks away and rebuild to show the Catch-up tags and the warning.
5. 1:25 Vendor checklist. Show a budget cap and the questions to ask. Tick a vendor and show the progress bar move.
6. 1:45 Ideas. Switch to Birthday, change the style to Playful, and show the ideas change.
7. 2:05 Claude ideas. Press Suggest ideas in the Claude section and read one result.
8. 2:25 Accessibility. Press Tab to show the skip link and focus outline, enter a bad guest count to show the error, and resize to phone width.
9. 2:45 Close. "Logic is covered by 17 unit tests and the code is on GitHub."
