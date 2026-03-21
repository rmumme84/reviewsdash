#!/usr/bin/env node
/**
 * reviews_google_places_api.js
 *
 * Coleta reviews de todos os hospitais da Rede D'Or via Google Places API (New).
 * GRATUITO: $200 créditos/mês = ~10,000 chamadas (suficiente para 49 hospitais).
 *
 * Uso:
 *   GOOGLE_PLACES_API_KEY=... node reviews_google_places_api.js
 *   node reviews_google_places_api.js --limit 5
 *   node reviews_google_places_api.js --hospital "Copa D'Or"
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = process.env.ACKER_ROOT || path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data', 'reviews');
const PLACES_PATH = path.join(DATA, 'places.json');
const REGISTRY_PATH = path.join(DATA, 'hospital_registry.json');
const OUT_PATH = path.join(DATA, 'google_places_reviews.json');

function arg(name, def=null){
  const ix = process.argv.indexOf(name);
  if(ix === -1) return def;
  return process.argv[ix+1] ?? def;
}

function readApiKey(){
  if(process.env.GOOGLE_PLACES_API_KEY) return process.env.GOOGLE_PLACES_API_KEY;
  try{
    return fs.readFileSync(path.join(DATA, 'google_api_key.txt'), 'utf8').trim();
  }catch{
    return null;
  }
}

function readJsonSafe(p){
  try{ return JSON.parse(fs.readFileSync(p,'utf8')); }catch{ return null; }
}

function readRegistry(){
  const j = readJsonSafe(REGISTRY_PATH);
  if(!j || typeof j !== 'object') return { disabledPlaceIds: [], extraHospitals: [] };
  const disabled = Array.isArray(j.disabledPlaceIds) ? j.disabledPlaceIds.map(x=>String(x||'').trim()).filter(Boolean) : [];
  const extra = Array.isArray(j.extraHospitals) ? j.extraHospitals.map(h=>({ name:String(h?.name||'').trim(), placeId: h?.placeId ? String(h.placeId).trim() : null })).filter(h=>h.name) : [];
  return { disabledPlaceIds: disabled, extraHospitals: extra };
}

function writeJson(p, obj){
  fs.mkdirSync(path.dirname(p), {recursive:true});
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

async function fetchPlaceDetails(apiKey, placeId){
  // IMPORTANT:
  // Google Places API (New) does NOT currently support forcing newest reviews via a query param.
  // To reliably get the newest 5 reviews, we use the *legacy* Place Details endpoint with
  // `reviews_sort=newest`.
  // This still uses the same API key and keeps the implementation simple.

  const fields = [
    'place_id','name','rating','user_ratings_total',
    'formatted_address','website','international_phone_number','reviews'
  ].join(',');

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${encodeURIComponent(fields)}&reviews_sort=newest&language=pt-BR&key=${encodeURIComponent(apiKey)}`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try{
          const json = JSON.parse(data);
          if(json.status && json.status !== 'OK'){
            reject(new Error(`${json.status}: ${json.error_message || 'Place Details legacy failed'}`));
            return;
          }
          resolve(json.result || {});
        }catch(e){
          reject(new Error('Invalid JSON'));
        }
      });
    }).on('error', reject);
  });
}

async function searchPlaceByName(apiKey, query){
  // Use Text Search (New) to find place_id
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const postData = JSON.stringify({ textQuery: query });
  
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try{
          const json = JSON.parse(data);
          if(json.error) reject(new Error(json.error.message));
          else resolve(json.places?.[0] || null);
        }catch(e){
          reject(new Error('Invalid JSON'));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function processHospital(apiKey, hospital){
  console.log(`\n🏥 ${hospital.name}`);
  
  try {
    // Se temos place_id, usa direto; senão, busca por nome
    let placeId = hospital.placeId;
    
    if(!placeId && hospital.name){
      console.log('  🔍 Buscando place_id...');
      const found = await searchPlaceByName(apiKey, hospital.name);
      if(!found) return { name: hospital.name, error: 'place_not_found', reviews: [] };
      placeId = found.id;
      console.log(`  ✅ Encontrado: ${placeId}`);
    }
    
    if(!placeId){
      return { name: hospital.name, error: 'no_place_id', reviews: [] };
    }
    
    console.log('  📋 Buscando detalhes...');
    const details = await fetchPlaceDetails(apiKey, placeId);
    
    const reviews = (details.reviews || []).slice(0, 5).map(r => ({
      author: r.author_name || 'Anônimo',
      rating: r.rating,
      date: r.relative_time_description,
      text: r.text || '',
      publishTime: (r.time ? new Date(r.time * 1000).toISOString() : null),
    }));

    console.log(`  ⭐ Rating: ${details.rating || '?'}`);
    console.log(`  📝 Reviews: ${reviews.length}`);

    return {
      name: details.name || hospital.name,
      placeId,
      rating: details.rating,
      reviewsCount: details.user_ratings_total,
      address: details.formatted_address,
      phone: details.international_phone_number,
      website: details.website,
      reviews,
    };
    
  } catch(err) {
    console.log(`  ❌ Erro: ${err.message}`);
    return { name: hospital.name, error: err.message, reviews: [] };
  }
}

async function main(){
  const apiKey = readApiKey();
  if(!apiKey){
    console.error('❌ GOOGLE_PLACES_API_KEY não configurada');
    process.exit(2);
  }
  
  const limit = parseInt(arg('--limit', '0'), 10) || 0;
  const targetHospital = arg('--hospital');
  const delayMs = 1000; // 1s entre chamadas (respeitar quotas)
  
  // Carrega lista de hospitais base + extras + removidos
  const placesData = readJsonSafe(PLACES_PATH);
  let hospitals = placesData?.places || [];

  const reg = readRegistry();
  const disabledSet = new Set(reg.disabledPlaceIds || []);

  // Add extra hospitals (from registry)
  if(Array.isArray(reg.extraHospitals) && reg.extraHospitals.length){
    for(const eh of reg.extraHospitals){
      hospitals.push({ name: eh.name, placeId: eh.placeId || undefined, extra: true });
    }
  }

  // Filter disabled by placeId
  hospitals = hospitals.filter(h => {
    const id = String(h.placeId || '').trim();
    if(!id) return true;
    return !disabledSet.has(id);
  });

  if(targetHospital){
    hospitals = hospitals.filter(h => 
      h.name?.toLowerCase().includes(targetHospital.toLowerCase())
    );
  }

  if(limit > 0){
    hospitals = hospitals.slice(0, limit);
  }
  
  console.log(`\n📊 Total de hospitais: ${hospitals.length}`);
  console.log(`💰 Estimativa: ${hospitals.length * 2} chamadas (gratuito até 10,000/mês)\n`);
  
  const results = [];
  let successCount = 0;
  let errorCount = 0;
  
  for(let i = 0; i < hospitals.length; i++){
    console.log(`\n[${i+1}/${hospitals.length}]`);
    const result = await processHospital(apiKey, hospitals[i]);
    results.push(result);
    
    if(result.error) errorCount++;
    else successCount++;
    
    if(i < hospitals.length - 1){
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  
  // Deduplicate by placeId (places.json sometimes contains duplicates)
  const byId = new Map();
  for(const h of results){
    const id = String(h.placeId || '').trim();
    if(!id){
      // keep no-id entries but make them unique by name
      const k = 'name:' + String(h.name||'').trim().toLowerCase();
      if(!byId.has(k)) byId.set(k, h);
      continue;
    }
    if(!byId.has(id)){
      byId.set(id, h);
      continue;
    }
    const cur = byId.get(id);
    const curOk = !cur.error;
    const hOk = !h.error;
    if(curOk && !hOk) continue;
    if(!curOk && hOk){ byId.set(id, h); continue; }
    // both ok or both error: prefer higher reviewsCount (fallback: longer name)
    const curN = Number(cur.reviewsCount || 0);
    const hN = Number(h.reviewsCount || 0);
    if(hN > curN) { byId.set(id, h); continue; }
    if(hN === curN && String(h.name||'').length > String(cur.name||'').length){ byId.set(id, h); continue; }
  }
  const deduped = Array.from(byId.values());

  const output = {
    generatedAt: new Date().toISOString(),
    source: 'google_places_api_legacy_details_newest',
    totalHospitals: deduped.length,
    success: deduped.filter(x=>!x.error).length,
    errors: deduped.filter(x=>x.error).length,
    hospitals: deduped,
    duplicatesRemoved: results.length - deduped.length,
  };
  
  writeJson(OUT_PATH, output);
  
  console.log(`\n✅ CONCLUÍDO!`);
  console.log(`   Arquivo: ${OUT_PATH}`);
  console.log(`   Sucessos: ${successCount}/${hospitals.length}`);
  console.log(`   Erros: ${errorCount}`);
  console.log(`   💰 Total de chamadas API: ~${hospitals.length * 2}`);
}

main().catch(err => {
  console.error('Erro fatal:', err.message);
  process.exit(2);
});
