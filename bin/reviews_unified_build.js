#!/usr/bin/env node
/**
 * Build unified reviews dataset for the site.
 *
 * SSOT: /opt/acker-site/data/reviews/reviews_archive.jsonl (append-only, deduped by dedupeKey)
 * Meta (rating/reviewsCount + newest 5): /opt/acker-site/data/reviews/google_places_reviews.json
 * Places registry (hospital list): /opt/acker-site/data/reviews/places.json
 *
 * Output:
 * - /opt/acker-site/data/reviews/reviews_unified.json
 */

const fs = require('fs');
const path = require('path');

function arg(name, def = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v == null ? def : v;
}

const PLACES = arg('--places', '/opt/acker-site/data/reviews/places.json');
const GP = arg('--google-places', '/opt/acker-site/data/reviews/google_places_reviews.json');
const ARCHIVE = arg('--archive', '/opt/acker-site/data/reviews/reviews_archive.jsonl');
const OUT = arg('--out', '/opt/acker-site/data/reviews/reviews_unified.json');

function readJson(p, def = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return def; }
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toIso(ms) {
  if (!Number.isFinite(ms)) return null;
  try { return new Date(ms).toISOString(); } catch { return null; }
}

function reviewFingerprint(placeId, review) {
  return [
    String(placeId || '').trim(),
    norm(review?.author || ''),
    String(review?.rating ?? ''),
    norm(review?.text || ''),
  ].join('|');
}

function main() {
  const places = readJson(PLACES, null);
  if (!places?.places) {
    console.error('ERR: places.json invalid', PLACES);
    process.exit(2);
  }

  const gp = readJson(GP, { hospitals: [] });
  const gpHospitals = Array.isArray(gp?.hospitals) ? gp.hospitals : [];
  const gpByPlaceId = new Map(gpHospitals.map(h => [String(h.placeId || ''), h]));

  // Initialize per-hospital buckets
  const bucket = new Map(); // placeId -> { byKey:Set, byFingerprint:Set, reviews:[] }
  for (const p of places.places) {
    const placeId = String(p.placeId || '').trim();
    if (!placeId) continue;
    bucket.set(placeId, { byKey: new Set(), byFingerprint: new Set(), reviews: [] });
  }

  let scanned = 0;
  let accepted = 0;

  if (fs.existsSync(ARCHIVE)) {
    const rl = require('readline').createInterface({
      input: fs.createReadStream(ARCHIVE, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      scanned++;
      const s = String(line || '').trim();
      if (!s) return;
      let j;
      try { j = JSON.parse(s); } catch { return; }

      const placeId = String(j.placeId || '').trim();
      if (!placeId) return;
      const b = bucket.get(placeId);
      if (!b) return;

      const key = j.dedupeKey || (j.rawId ? ('ui:' + String(j.rawId)) : null);
      if (key && b.byKey.has(key)) return;

      const pt = Number(j.publishTimeMs);
      const publishTimeMs = Number.isFinite(pt) ? pt : null;

      const r = {
        source: j.source || null,
        rawId: j.rawId || null,
        rating: (j.rating == null ? null : Number(j.rating)),
        publishTimeMs,
        publishTime: j.publishTime || (publishTimeMs != null ? toIso(publishTimeMs) : null),
        relativeTime: null,
        text: j.text || null,
        textSnippet: j.text ? String(j.text).slice(0, 180) : null,
        author: j.author || null,
        ownerResponse: j.ownerResponse ? { text: j.ownerResponse } : null,
      };

      const fp = reviewFingerprint(placeId, r);
      if (b.byFingerprint.has(fp)) return;

      if (key) b.byKey.add(key);
      b.byFingerprint.add(fp);
      b.reviews.push(r);
      accepted++;
    });

    rl.on('close', () => {
      const hospitalsOut = [];

      for (const p of places.places) {
        const placeId = String(p.placeId || '').trim();
        if (!placeId) continue;

        const b = bucket.get(placeId) || { reviews: [] };
        b.reviews.sort((a, b) => (Number(b.publishTimeMs) || 0) - (Number(a.publishTimeMs) || 0));

        const gpH = gpByPlaceId.get(placeId) || null;
        const rating = gpH && Number.isFinite(Number(gpH.rating)) ? Number(gpH.rating) : null;
        const reviewsCount = gpH && Number.isFinite(Number(gpH.reviewsCount ?? gpH.userRatingsTotal))
          ? Number(gpH.reviewsCount ?? gpH.userRatingsTotal)
          : null;

        hospitalsOut.push({
          placeId,
          name: p.name || gpH?.name || null,
          address: p.address || gpH?.address || null,
          mapsUrl: p.mapsUrl || null,
          sourceUrl: p.sourceUrl || null,
          source: 'ssot_archive',
          fid: null,
          extractedAt: new Date().toISOString(),
          rating,
          reviewsCount,
          reviews: b.reviews,
        });
      }

      hospitalsOut.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));

      const out = {
        ok: true,
        updatedAt: new Date().toISOString(),
        sources: {
          ssot_archive: { linesScanned: scanned, reviewsAccepted: accepted },
          google_places_api: { hospitals: gpHospitals.length },
        },
        hospitals: hospitalsOut,
      };

      ensureDir(path.dirname(OUT));
      fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
      console.log(JSON.stringify({ ok: true, hospitals: hospitalsOut.length, scanned, accepted, out: OUT }, null, 2));
    });

    return;
  }

  console.error('ERR: archive not found', ARCHIVE);
  process.exit(2);
}

main();
