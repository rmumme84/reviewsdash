#!/usr/bin/env node
/**
 * Minimal placeholder builder for restore MVP.
 *
 * Generates data/reviews/reviews_report90.json so the refresh pipeline can run
 * locally inside core2 even before a full report90 builder exists.
 */

const fs = require('fs');
const path = require('path');

function arg(name, def = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v == null ? def : v;
}

const ROOT = process.env.ACKER_ROOT || path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'reviews');
const IN = arg('--in', path.join(DATA_DIR, 'reviews_unified.json'));
const OUT = arg('--out', path.join(DATA_DIR, 'reviews_report90.json'));

function readJson(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

function main() {
  const unified = readJson(IN, {});
  const hospitals = Array.isArray(unified?.hospitals) ? unified.hospitals : [];

  const out = {
    ok: true,
    placeholder: true,
    kind: 'reviews_report90_placeholder',
    updatedAt: new Date().toISOString(),
    source: IN,
    hospitals: hospitals.length,
    note: 'Restore MVP placeholder. Replace bin/reviews_report90_build.js with the full builder when available.',
  };

  writeJson(OUT, out);
  console.log(JSON.stringify({ ok: true, placeholder: true, out: OUT, hospitals: hospitals.length }));
}

main();
