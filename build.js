// Inlines src/planner.js into src/template.html.
// dist/index.html    full page for GitHub Pages / any static host
// dist/artifact.html fragment for Claude's Artifact publisher (it adds the document skeleton)
const fs = require('fs');
const path = require('path');
const root = __dirname;
const planner = fs.readFileSync(path.join(root, 'src/planner.js'), 'utf8');
const template = fs.readFileSync(path.join(root, 'src/template.html'), 'utf8');
const fragment = template.replace('/*PLANNER*/', () => planner);

const hoist = (re) => { const m = fragment.match(re); return m ? m[0] : ''; };
const title = hoist(/<title>[\s\S]*?<\/title>/);
const meta = '<meta name="description" content="Plan a wedding, birthday or community event: budget split, dated timeline, vendor checklist and ideas.">';
const style = hoist(/<style>[\s\S]*?<\/style>/);
const body = fragment.replace(title, '').replace(/<meta name="claude:viewport-fit-sides"[^>]*>/, '').replace(style, '');

const page = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + meta + '\n' + title + '\n' +
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600;700&display=swap">\n' +
  style + '\n</head>\n<body>\n' + body.trim() + '\n</body>\n</html>\n';

const artifact = fragment.replace('<title>', '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600;700&display=swap">\n<title>');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/index.html'), page);
fs.writeFileSync(path.join(root, 'dist/artifact.html'), artifact);
console.log('built dist/index.html (' + page.length + ' bytes) and dist/artifact.html (' + artifact.length + ' bytes)');
