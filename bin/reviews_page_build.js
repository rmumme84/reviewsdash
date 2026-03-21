#!/usr/bin/env node
/**
 * Build a lightweight dataset for the legacy /reviews page.
 *
 * Goal: avoid loading the full ~100MB reviews_unified.json in the browser.
 * Strategy: keep only recent reviews (default 400 days) and only the fields
 * the UI needs for filtering + rendering.
 */

const fs = require('fs');
const path = require('path');

function arg(name, def=null){
  const i = process.argv.indexOf(name);
  if(i === -1) return def;
  const v = process.argv[i+1];
  return v == null ? def : v;
}

const inPath = arg('--in', '/opt/acker-site/data/reviews/reviews_unified.json');
const outPath = arg('--out', '/opt/acker-site/data/reviews/reviews_page.json');
const days = Number(arg('--days', process.env.REVIEWS_PAGE_DAYS || '400'));
const maxText = Number(arg('--max-text', process.env.REVIEWS_PAGE_MAX_TEXT || '1200'));

function isoToMs(iso){
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function reviewMs(r){
  if(!r) return null;
  if(r.publishTimeMs != null && Number.isFinite(Number(r.publishTimeMs))) return Number(r.publishTimeMs);
  const iso = r.iso || r.publishTime || r.date || null;
  if(iso) return isoToMs(iso);
  return null;
}

function authorName(x){
  if(!x) return '';
  if(typeof x === 'string') return x;
  if(typeof x === 'object') return x.name || x.displayName || x.authorName || '';
  return '';
}

function main(){
  const raw = fs.readFileSync(inPath, 'utf8');
  const j = JSON.parse(raw);

  const nowMs = Date.now();
  const minMs = nowMs - days*24*3600*1000;

  const hospitalsIn = Array.isArray(j.hospitals) ? j.hospitals : [];

  // Dedup across sources/runs (match ReviewsDash behavior)
  const seen = new Set();

  const hospitals = [];
  for(const h of hospitalsIn){
    const name = h.hospital || h.name || h.hospitalName || null;
    const placeId = h.placeId;
    const rating = h.rating ?? null;
    const reviewsCount = h.reviewsCount ?? null;
    const address = h.address || null;

    const reviews = [];
    for(const r of (h.reviews||[])){
      const ms = reviewMs(r);
      if(ms == null || ms < minMs) continue;

      const rRating = Number.isFinite(Number(r.rating)) ? Number(r.rating) : null;
      if(rRating == null) continue;

      const text = String(r.text || r.original_text || '').slice(0, maxText);

      const iso = new Date(ms).toISOString();
      const author = authorName(r.author || r.author_name || r.authorName || r.user || r);
      const rawId = r.rawId || r.reviewId || null;
      const key = rawId || `${String(placeId||'')}|${iso}|${String(rRating)}|${String(author||'')}|${String(text||'').slice(0,80)}`;
      if(seen.has(key)) continue;
      seen.add(key);

      reviews.push({
        rating: rRating,
        publishTime: iso,
        author,
        text,
        rawId,
      });
    }

    // Sort newest first
    reviews.sort((a,b)=> (a.publishTime > b.publishTime ? -1 : 1));

    hospitals.push({ name, placeId, rating, reviewsCount, address, reviews });
  }

  const totalReviews = hospitals.reduce((s,h)=>s+h.reviews.length,0);

  const out = {
    ok: true,
    kind: 'reviews_page_lite',
    updatedAt: j.updatedAt || new Date().toISOString(),
    windowDays: days,
    hospitals,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out), 'utf8');

  console.log(JSON.stringify({
    ok: true,
    out: outPath,
    hospitals: hospitals.length,
    reviews: totalReviews,
    windowDays: days,
    bytes: Buffer.byteLength(JSON.stringify(out)),
  }));
}

main();
