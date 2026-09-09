'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Isolate only external analytics. First-party requests and browser errors
// remain visible and must fail every browser test.
async function prepareContext(context) {
  await context.route(/^https:\/\/(?:www\.googletagmanager\.com|www\.google-analytics\.com|[a-z0-9.-]*clarity\.ms)\//,
    route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
}

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push('pageerror: ' + error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push('console: ' + message.text());
  });
  return () => {
    if (errors.length) throw new Error(errors.join('\n'));
  };
}

async function setModelColors(context, colors) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'cfg-pages.js'), 'utf8');
  const assignment = /^window\.KV_PAGES\s*=\s*(\{.*\});?\s*$/m.exec(source);
  if (!assignment) throw new Error('Missing configurator templates');
  const pages = JSON.parse(assignment[1]);
  pages.koverta = pages.koverta.replace(/(data-sp-bio-data>)([\s\S]*?)(<\/script>)/,
    (match, start, json, end) => {
      const data = JSON.parse(json);
      for (const model of Object.values(data.models)) Object.assign(model, colors);
      return start + JSON.stringify(data) + end;
    });
  await context.route(/\/cfg-pages\.js(?:\?|$)/, route => route.fulfill({
    status: 200, contentType: 'application/javascript',
    body: 'window.KV_PAGES = ' + JSON.stringify(pages) + ';'
  }));
}

module.exports = { prepareContext, watchErrors, setModelColors };
