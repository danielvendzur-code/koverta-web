'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ignored = new Set(['.git', 'archiv-expivi', 'node_modules', 'qa-artifacts']);
const htmlFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.toLowerCase().endsWith('.html')) htmlFiles.push(full);
  }
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? (match[1] ?? match[2] ?? '') : null;
}

function publicPath(file) {
  const rel = path.relative(root, file).replaceAll('\\', '/');
  return rel === 'index.html' ? '/' : '/' + rel.replace(/index\.html$/i, '');
}

function localTarget(file, url) {
  const clean = url.split(/[?#]/, 1)[0];
  if (!clean || clean.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith('//')) return null;
  const decoded = decodeURIComponent(clean);
  const full = decoded.startsWith('/')
    ? path.join(root, decoded.replace(/^\/+/, ''))
    : path.resolve(path.dirname(file), decoded);
  if (!full.startsWith(root + path.sep) && full !== root) return { invalid: true, full };
  if (path.extname(full)) return { full };
  return { full: path.join(full, 'index.html') };
}

walk(root);
const errors = [];
const warnings = [];
const canonicals = new Map();
const noindexPages = [];
const indexablePaths = [];
const nonPublic = /^(?:404\.html|interny-odhad-patiek\/|konfigurator\/test\/)/;

for (const file of htmlFiles.sort()) {
  const rel = path.relative(root, file).replaceAll('\\', '/');
  if (nonPublic.test(rel)) continue;
  const source = fs.readFileSync(file, 'utf8');
  const head = (source.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i) || ['', ''])[1];
  if (/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(head)) noindexPages.push(rel);
  else indexablePaths.push(publicPath(file));
  const visible = source.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '');
  const titles = [...head.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)];
  const descriptions = [...head.matchAll(/<meta\b[^>]*name=["']description["'][^>]*>/gi)];
  const canonicalTags = [...head.matchAll(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi)];
  const ogUrls = [...head.matchAll(/<meta\b[^>]*property=["']og:url["'][^>]*>/gi)];
  const h1s = [...visible.matchAll(/<h1\b/gi)];

  if (titles.length !== 1 || !titles[0][1].trim()) errors.push(`${rel}: expected one non-empty <title>`);
  if (descriptions.length !== 1 || !attr(descriptions[0][0], 'content')) errors.push(`${rel}: expected one meta description`);
  if (canonicalTags.length !== 1) errors.push(`${rel}: expected one canonical link`);
  if (ogUrls.length !== 1) errors.push(`${rel}: expected one og:url`);
  if (h1s.length !== 1) errors.push(`${rel}: expected one H1, found ${h1s.length}`);
  if (!/<html\b[^>]*lang=["']sk["']/i.test(source)) errors.push(`${rel}: missing lang="sk"`);
  if (!/<meta\b[^>]*name=["']viewport["']/i.test(source)) errors.push(`${rel}: missing viewport meta`);

  if (canonicalTags.length === 1) {
    const canonical = attr(canonicalTags[0][0], 'href') || '';
    if (!/^https:\/\/koverta\.sk\//.test(canonical)) errors.push(`${rel}: invalid canonical ${canonical}`);
    if (ogUrls.length === 1 && attr(ogUrls[0][0], 'content') !== canonical) {
      errors.push(`${rel}: og:url differs from canonical`);
    }
    const previous = canonicals.get(canonical);
    if (previous && canonical) errors.push(`${rel}: duplicate canonical also used by ${previous}`);
    else if (canonical) canonicals.set(canonical, rel);
  }
  if (/href=["'],,\//i.test(source)) errors.push(`${rel}: broken neighbouring dimension URL`);
  if (/https:\/\/danielvendzur-code\.github\.io\/koverta-web/i.test(head)) {
    errors.push(`${rel}: old GitHub Pages origin in metadata`);
  }

  for (const script of source.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { JSON.parse(script[1]); }
    catch (error) { errors.push(`${rel}: invalid JSON-LD (${error.message})`); }
  }
  if (/\/(?:pristresky-pre-auta|zahradne-pristresky)\/rozmer\//.test(publicPath(file))) {
    const products = [...source.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
      .map(match => { try { return JSON.parse(match[1]); } catch { return null; } })
      .filter(data => data && data['@type'] === 'Product');
    if (products.length !== 1) errors.push(`${rel}: expected exactly one Product JSON-LD, found ${products.length}`);
    if (products[0]?.offers?.availability === 'https://schema.org/InStock') {
      errors.push(`${rel}: made-to-order variant must not claim InStock`);
    }
  }

  for (const tag of visible.matchAll(/<(?:img|a|link|script)\b[^>]*>/gi)) {
    const markup = tag[0];
    const url = attr(markup, /^<a/i.test(markup) ? 'href' : /^<img/i.test(markup) ? 'src' : 'href')
      ?? attr(markup, 'src');
    if (url) {
      const target = localTarget(file, url);
      if (target?.invalid) errors.push(`${rel}: local URL escapes repository (${url})`);
      else if (target && !fs.existsSync(target.full)) errors.push(`${rel}: missing local target ${url}`);
    }
    if (/^<img/i.test(markup)) {
      if (attr(markup, 'alt') === null) errors.push(`${rel}: image missing alt (${url || 'inline'})`);
      const isSvg = /\.svg(?:[?#]|$)/i.test(url || '');
      if (!isSvg && (attr(markup, 'width') === null || attr(markup, 'height') === null)) {
        warnings.push(`${rel}: raster image lacks width/height (${url || 'inline'})`);
      }
    }
  }
}

const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
if (!/^Sitemap:\s*https:\/\/koverta\.sk\/sitemap\.xml\s*$/im.test(robots)) {
  errors.push('robots.txt: missing absolute sitemap declaration');
}
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const sitemapPaths = new Set();
for (const [, url] of sitemap.matchAll(/<loc>(https:\/\/koverta\.sk\/[^<]*)<\/loc>/g)) {
  const pathname = new URL(url).pathname;
  sitemapPaths.add(pathname);
  const target = pathname === '/' ? path.join(root, 'index.html') : path.join(root, pathname, 'index.html');
  if (!fs.existsSync(target)) errors.push(`sitemap.xml: URL has no page (${url})`);
}
for (const pathname of indexablePaths) {
  if (!sitemapPaths.has(pathname)) errors.push(`sitemap.xml: indexable page missing (${pathname})`);
}

console.log(`SEO_AUDIT ${canonicals.size} HTML pages with unique canonicals`);
if (noindexPages.length) console.log(`SEO_NOINDEX ${noindexPages.length} pages currently excluded from search (review before launch)`);
if (warnings.length) {
  console.log(`SEO_WARNINGS ${warnings.length}`);
  warnings.slice(0, 40).forEach((warning) => console.log(`WARN ${warning}`));
  if (warnings.length > 40) console.log(`WARN ... ${warnings.length - 40} more`);
}
if (errors.length) {
  errors.forEach((error) => console.error(`ERROR ${error}`));
  process.exitCode = 1;
} else {
  console.log('SEO_AUDIT_PASS metadata, canonical/OG URLs, JSON-LD, local targets, image alt text and sitemap');
}
