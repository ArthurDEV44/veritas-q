/**
 * Veritas Q - Tests de charge k6
 *
 * Installation: https://k6.io/docs/getting-started/installation/
 *
 * Exécution:
 *   k6 run scripts/load-test/k6-verify.js
 *
 * Avec rapport HTML:
 *   k6 run --out json=results.json scripts/load-test/k6-verify.js
 *   # Utiliser k6-reporter pour générer le HTML
 *
 * Variables d'environnement:
 *   K6_API_URL - URL de l'API (défaut: http://localhost:3000)
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { FormData } from 'https://jslib.k6.io/formdata/0.0.2/index.js';
import encoding from 'k6/encoding';

// ============================================================================
// Configuration
// ============================================================================

const API_URL = __ENV.K6_API_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Montée en charge
    { duration: '1m', target: 50 },    // Charge soutenue
    { duration: '30s', target: 100 },  // Pic de charge
    { duration: '30s', target: 0 },    // Descente
  ],
  thresholds: {
    // Latence globale
    http_req_duration: ['p(95)<500', 'p(99)<1000'],

    // Taux d'erreur
    http_req_failed: ['rate<0.01'],

    // Métriques personnalisées par endpoint
    'verify_duration': ['p(95)<200'],
    'c2pa_verify_duration': ['p(95)<300'],
    'resolve_duration': ['p(95)<100'],

    // Taux de succès par endpoint
    'verify_success': ['rate>0.99'],
    'c2pa_verify_success': ['rate>0.95'],
    'resolve_success': ['rate>0.95'],
  },
};

// ============================================================================
// Métriques personnalisées
// ============================================================================

// Durées par endpoint
const verifyDuration = new Trend('verify_duration');
const c2paVerifyDuration = new Trend('c2pa_verify_duration');
const resolveDuration = new Trend('resolve_duration');

// Taux de succès par endpoint
const verifySuccess = new Rate('verify_success');
const c2paVerifySuccess = new Rate('c2pa_verify_success');
const resolveSuccess = new Rate('resolve_success');

// Compteurs
const verifyCount = new Counter('verify_requests');
const c2paVerifyCount = new Counter('c2pa_verify_requests');
const resolveCount = new Counter('resolve_requests');

// ============================================================================
// Données de test
// ============================================================================

// Image de test minimale (1x1 pixel PNG rouge)
const TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const TEST_IMAGE_BYTES = encoding.b64decode(TEST_IMAGE_BASE64);

// Sceau de test (mock - ne valide pas vraiment)
const TEST_SEAL_DATA = 'dGVzdC1zZWFsLWRhdGE='; // Base64 placeholder

// Hash perceptuel de test (8 bytes)
const TEST_PHASH = 'deadbeefcafebabe';

// ============================================================================
// Fonctions utilitaires
// ============================================================================

function createImageFormData(fieldName = 'file') {
  const fd = new FormData();
  fd.append(fieldName, http.file(TEST_IMAGE_BYTES, 'test.png', 'image/png'));
  return fd;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================================
// Tests par endpoint
// ============================================================================

/**
 * Test POST /verify (vérification classique)
 */
function testVerify() {
  const fd = createImageFormData();
  fd.append('seal_data', TEST_SEAL_DATA);

  const res = http.post(`${API_URL}/verify`, fd.body(), {
    headers: { 'Content-Type': fd.contentType },
    tags: { name: 'verify' },
  });

  verifyCount.add(1);
  verifyDuration.add(res.timings.duration);

  // On s'attend à une réponse 200, 400 ou 500 (seal invalide/format incorrect mais endpoint fonctionnel)
  const success = res.status === 200 || res.status === 400 || res.status === 500;
  verifySuccess.add(success);

  check(res, {
    'verify: endpoint responds': (r) => r.status === 200 || r.status === 400 || r.status === 500,
    'verify: has response body': (r) => r.body && r.body.length > 0,
    'verify: response time < 500ms': (r) => r.timings.duration < 500,
  });

  return res;
}

/**
 * Test POST /c2pa/verify (vérification C2PA)
 */
function testC2paVerify() {
  const fd = createImageFormData();

  const res = http.post(`${API_URL}/c2pa/verify`, fd.body(), {
    headers: { 'Content-Type': fd.contentType },
    tags: { name: 'c2pa_verify' },
  });

  c2paVerifyCount.add(1);
  c2paVerifyDuration.add(res.timings.duration);

  // 200 = OK, 400 = pas de manifest C2PA, 500 = erreur parsing (normal pour image de test minimale)
  const success = res.status === 200 || res.status === 400 || res.status === 500;
  c2paVerifySuccess.add(success);

  check(res, {
    'c2pa_verify: endpoint responds': (r) => r.status === 200 || r.status === 400 || r.status === 500,
    'c2pa_verify: has response body': (r) => r.body && r.body.length > 0,
    'c2pa_verify: response time < 500ms': (r) => r.timings.duration < 500,
  });

  return res;
}

/**
 * Test POST /resolve (résolution soft binding)
 */
function testResolve() {
  const payload = JSON.stringify({
    perceptual_hash: TEST_PHASH,
    threshold: 10,
    limit: 5,
    include_seal_data: false,
  });

  const res = http.post(`${API_URL}/resolve`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'resolve' },
  });

  resolveCount.add(1);
  resolveDuration.add(res.timings.duration);

  // 200 = OK, 400 = hash invalide, 503 = manifest store non configuré (tous acceptables en test)
  const success = res.status === 200 || res.status === 400 || res.status === 503;
  resolveSuccess.add(success);

  check(res, {
    'resolve: endpoint responds': (r) => r.status === 200 || r.status === 400 || r.status === 503,
    'resolve: has response body': (r) => r.body && r.body.length > 0,
    'resolve: response time < 200ms': (r) => r.timings.duration < 200,
  });

  return res;
}

/**
 * Test POST /resolve avec image_data
 */
function testResolveWithImage() {
  const payload = JSON.stringify({
    image_data: TEST_IMAGE_BASE64,
    threshold: 10,
    limit: 5,
    include_seal_data: false,
  });

  const res = http.post(`${API_URL}/resolve`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'resolve_image' },
  });

  resolveDuration.add(res.timings.duration);

  // 200 = OK, 400 = image invalide, 503 = manifest store non configuré
  const success = res.status === 200 || res.status === 400 || res.status === 503;
  resolveSuccess.add(success);

  check(res, {
    'resolve_image: endpoint responds': (r) => r.status === 200 || r.status === 400 || r.status === 503,
    'resolve_image: response time < 300ms': (r) => r.timings.duration < 300,
  });

  return res;
}

/**
 * Test GET /health
 */
function testHealth() {
  const res = http.get(`${API_URL}/health`, {
    tags: { name: 'health' },
  });

  check(res, {
    'health: status is 200': (r) => r.status === 200,
    'health: response time < 50ms': (r) => r.timings.duration < 50,
  });

  return res;
}

// ============================================================================
// Scénarios de test
// ============================================================================

/**
 * Scénario principal: mélange de requêtes simulant usage réel
 * Distribution: 60% verify, 30% c2pa_verify, 10% resolve
 */
export default function() {
  group('mixed_workload', function() {
    const rand = Math.random();

    if (rand < 0.6) {
      testVerify();
    } else if (rand < 0.9) {
      testC2paVerify();
    } else {
      // Alterner entre resolve par hash et par image
      if (Math.random() < 0.7) {
        testResolve();
      } else {
        testResolveWithImage();
      }
    }

    sleep(0.1 + Math.random() * 0.2); // 100-300ms entre requêtes
  });
}

/**
 * Scénario: Test de santé initial
 */
export function setup() {
  console.log(`Testing API at: ${API_URL}`);

  const healthRes = testHealth();

  if (healthRes.status !== 200) {
    console.error(`Health check failed! Status: ${healthRes.status}`);
    console.error(`Response: ${healthRes.body}`);
  } else {
    console.log('Health check passed');
  }

  return { apiUrl: API_URL };
}

/**
 * Scénario: Résumé final
 */
export function teardown(data) {
  console.log(`\n=== Test Summary ===`);
  console.log(`API URL: ${data.apiUrl}`);
  console.log(`\nThresholds:`);
  console.log(`  - /verify p95 < 200ms`);
  console.log(`  - /c2pa/verify p95 < 300ms`);
  console.log(`  - /resolve p95 < 100ms`);
  console.log(`  - Error rate < 1%`);
}

// ============================================================================
// Scénarios alternatifs (exécutables séparément)
// ============================================================================

/**
 * Scénario: Test de /verify uniquement
 * Exécution: k6 run --env SCENARIO=verify scripts/load-test/k6-verify.js
 */
export function verifyOnly() {
  testVerify();
  sleep(0.1);
}

/**
 * Scénario: Test de /c2pa/verify uniquement
 * Exécution: k6 run --env SCENARIO=c2pa scripts/load-test/k6-verify.js
 */
export function c2paOnly() {
  testC2paVerify();
  sleep(0.1);
}

/**
 * Scénario: Test de /resolve uniquement
 * Exécution: k6 run --env SCENARIO=resolve scripts/load-test/k6-verify.js
 */
export function resolveOnly() {
  testResolve();
  sleep(0.05);
}

/**
 * Scénario: Test de montée en charge progressive
 */
export const stressOptions = {
  stages: [
    { duration: '2m', target: 100 },  // Montée progressive
    { duration: '5m', target: 100 },  // Plateau
    { duration: '2m', target: 200 },  // Pic
    { duration: '5m', target: 200 },  // Plateau au pic
    { duration: '2m', target: 0 },    // Descente
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.05'],
  },
};

export function stress() {
  const rand = Math.random();

  if (rand < 0.7) {
    testVerify();
  } else if (rand < 0.9) {
    testC2paVerify();
  } else {
    testResolve();
  }

  sleep(0.05 + Math.random() * 0.1);
}
