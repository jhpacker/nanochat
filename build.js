#!/usr/bin/env node
// Build the single-file index.html at the repo root by inlining extension/styles.css
// and extension/app.js into extension/index.html. Source of truth is extension/.
//
// Usage: node build.js

const fs = require('fs');
const path = require('path');

const root = __dirname;
const srcHtml = fs.readFileSync(path.join(root, 'extension/index.html'), 'utf8');
const css     = fs.readFileSync(path.join(root, 'extension/styles.css'),  'utf8');
const js      = fs.readFileSync(path.join(root, 'extension/app.js'),      'utf8');

const linkRe   = /<link\s+rel="stylesheet"\s+href="styles\.css"\s*\/?>/;
const scriptRe = /<script\s+src="app\.js"\s*><\/script>/;

if (!linkRe.test(srcHtml))   { console.error('FAIL: stylesheet link not found in extension/index.html'); process.exit(1); }
if (!scriptRe.test(srcHtml)) { console.error('FAIL: script src not found in extension/index.html');      process.exit(1); }

// Pass replacements as functions so JS content like '\\$&' isn't interpreted
// as String.replace's special $-substitutions.
const out = srcHtml
  .replace(linkRe,   () => `<style>\n${css.trimEnd()}\n</style>`)
  .replace(scriptRe, () => `<script>\n${js.trimEnd()}\n</script>`);

fs.writeFileSync(path.join(root, 'index.html'), out);
console.log(`built index.html (${out.length.toLocaleString()} bytes)`);
