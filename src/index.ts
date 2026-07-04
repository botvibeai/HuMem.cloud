import { DurableObjectNamespace, KVNamespace, D1Database } from '@cloudflare/workers-types';
import { SignJWT, jwtVerify, importX509 } from 'jose';
export { MemCogDurableObject } from './MemCogDurableObject';

export interface Env {
  MEMCOG_OBJECT: DurableObjectNamespace;
  SEMANTIC_CACHE_KV: KVNamespace;
  ANALYTIC: D1Database;
  AI: Ai;
  PAYPAL_CLIENT_SECRET: string;
  PAYPAL_WEBHOOK_ID: string;
  JWT_SECRET: string;
}

// PayPal Client ID (public - safe to embed)
const PAYPAL_CLIENT_ID = 'AaNitTUh_XOdWy2fLAqHvd59cvYd961wP-blU5RSng7WSx81g9BYFrfIyUm_rAoykfNsx4UKtPt_jurF';
const PAYPAL_API_BASE  = 'https://api-m.paypal.com';

const GOOGLE_CERTS_URL  = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const FIREBASE_PROJECT  = 'humem-cloud';

const RATE_LIMIT_WINDOW = 60;
const RATE_LIMIT_MAX    = 60;

const PLANS = [
  { name: 'HuMem Developer',        description: 'Persistent AI Memory - Developer Tier',        price: '49.00',  interval: 'MONTH', kvKey: 'paypal_plan_developer'  },
  { name: 'HuMem Enterprise Scale', description: 'Persistent AI Memory - Enterprise Scale Tier', price: '499.00', interval: 'MONTH', kvKey: 'paypal_plan_enterprise' },
];

// Helpers
function jsonResponse(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':  'https://humem.cloud',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

async function getPayPalAccessToken(clientSecret: string, kv: KVNamespace): Promise<string> {
  const cached = await kv.get('paypal:access_token');
  if (cached) return cached;

  const credentials = btoa(`${PAYPAL_CLIENT_ID}:${clientSecret}`);
  const resp = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!resp.ok) throw new Error(`PayPal OAuth failed (${resp.status})`);

  const data = await resp.json() as { access_token: string; expires_in: number };
  if (!data.access_token) throw new Error('PayPal OAuth returned no access_token');

  const ttl = Math.max(60, (data.expires_in || 3600) - 100);
  await kv.put('paypal:access_token', data.access_token, { expirationTtl: ttl });
  return data.access_token;
}

async function createPayPalPlan(token: string, plan: typeof PLANS[0]): Promise<string> {
  const productResp = await fetch(`${PAYPAL_API_BASE}/v1/catalogs/products`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: plan.name, description: plan.description, type: 'SERVICE', category: 'SOFTWARE' }),
  });
  if (!productResp.ok) throw new Error(`PayPal product creation failed (${productResp.status})`);
  const product = await productResp.json() as { id: string };
  if (!product.id) throw new Error('PayPal product creation returned no id');

  const planResp = await fetch(`${PAYPAL_API_BASE}/v1/billing/plans`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: product.id, name: plan.name, description: plan.description, status: 'ACTIVE',
      billing_cycles: [{ frequency: { interval_unit: plan.interval, interval_count: 1 }, tenure_type: 'REGULAR', sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: { value: plan.price, currency_code: 'USD' } } }],
      payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 3 },
    }),
  });
  if (!planResp.ok) throw new Error(`PayPal plan creation failed (${planResp.status})`);
  const created = await planResp.json() as { id: string };
  if (!created.id) throw new Error('PayPal plan creation returned no id');
  return created.id;
}

async function verifyFirebaseIdToken(idToken: string): Promise<{ email: string } | null> {
  try {
    const certsResp = await fetch(GOOGLE_CERTS_URL);
    if (!certsResp.ok) return null;
    const certs = await certsResp.json() as Record<string, string>;

    const [headerB64] = idToken.split('.');
    const header = JSON.parse(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/'))) as { kid: string };
    const certPem = certs[header.kid];
    if (!certPem) return null;

    const publicKey = await importX509(certPem, 'RS256');
    const { payload } = await jwtVerify(idToken, publicKey, {
      issuer:   `https://securetoken.google.com/${FIREBASE_PROJECT}`,
      audience: FIREBASE_PROJECT,
    });

    const email = payload.email as string;
    if (!email) return null;
    return { email };
  } catch {
    return null;
  }
}

async function verifyEd25519Signature(publicKeyHex: string, signatureHex: string, messageText: string): Promise<boolean> {
  try {
    const pubKeyBuffer = new Uint8Array(Buffer.from(publicKeyHex, 'hex'));
    const sigBuffer    = new Uint8Array(Buffer.from(signatureHex, 'hex'));
    const msgBuffer    = new TextEncoder().encode(messageText);
    const importedKey  = await crypto.subtle.importKey('raw', pubKeyBuffer, { name: 'NODE-ED25519', namedCurve: 'NODE-ED25519' }, true, ['verify']);
    return await crypto.subtle.verify('NODE-ED25519', importedKey, sigBuffer, msgBuffer);
  } catch { return false; }
}

async function isRateLimited(tenantId: string, kv: KVNamespace): Promise<boolean> {
  const key   = `rate:${tenantId}`;
  const raw   = await kv.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= RATE_LIMIT_MAX) return true;
  await kv.put(key, String(count + 1), { expirationTtl: count === 0 ? RATE_LIMIT_WINDOW : undefined });
  return false;
}

async function verifyPayPalWebhook(request: Request, rawBody: string, webhookId: string, accessToken: string): Promise<boolean> {
  const tid  = request.headers.get('PAYPAL-TRANSMISSION-ID')   ?? '';
  const time = request.headers.get('PAYPAL-TRANSMISSION-TIME') ?? '';
  const cert = request.headers.get('PAYPAL-CERT-URL')          ?? '';
  const sig  = request.headers.get('PAYPAL-TRANSMISSION-SIG')  ?? '';
  const algo = request.headers.get('PAYPAL-AUTH-ALGO')         ?? '';
  if (!tid || !cert || !sig) return false;

  try {
    const certHost = new URL(cert).hostname;
    if (!certHost.endsWith('.paypal.com')) return false;
  } catch { return false; }

  const resp = await fetch(`${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ transmission_id: tid, transmission_time: time, cert_url: cert, auth_algo: algo, transmission_sig: sig, webhook_id: webhookId, webhook_event: JSON.parse(rawBody) }),
  });
  if (!resp.ok) return false;
  const result = await resp.json() as { verification_status: string };
  return result.verification_status === 'SUCCESS';
}

// Main Worker
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url  = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Auth: Challenge
    if (path === '/v1/auth/challenge' && request.method === 'POST') {
      const body = await request.json() as { public_key?: unknown };
      const pk   = typeof body.public_key === 'string' ? body.public_key.trim() : '';
      if (!pk || pk.length > 256) return jsonResponse({ error: 'Invalid public_key' }, 400);
      const challenge = crypto.randomUUID();
      await env.SEMANTIC_CACHE_KV.put(`challenge:${pk}`, challenge, { expirationTtl: 30 });
      return jsonResponse({ challenge });
    }

    // Auth: Verify signature & issue JWT
    if (path === '/v1/auth/verify' && request.method === 'POST') {
      const body = await request.json() as { public_key?: unknown; signature?: unknown };
      const pk   = typeof body.public_key === 'string' ? body.public_key : '';
      const sig  = typeof body.signature  === 'string' ? body.signature  : '';
      const storedChallenge = await env.SEMANTIC_CACHE_KV.get(`challenge:${pk}`);
      if (!storedChallenge) return jsonResponse({ error: 'Challenge expired or missing' }, 401);

      // Delete challenge immediately to prevent replay
      await env.SEMANTIC_CACHE_KV.delete(`challenge:${pk}`);

      const isValid = await verifyEd25519Signature(pk, sig, storedChallenge);
      if (!isValid) return jsonResponse({ error: 'Signature mismatch' }, 401);

      const email = await env.SEMANTIC_CACHE_KV.get(`api_key:${pk}`);
      if (!email) return jsonResponse({ error: 'Unregistered API key. Generate via dashboard.' }, 403);

      const secret = new TextEncoder().encode(env.JWT_SECRET);
      const token  = await new SignJWT({ public_key: pk, email })
        .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('24h').sign(secret);
      return jsonResponse({ token, status: 'authenticated' });
    }

    // Auth: Secure Firebase exchange (requires valid Firebase ID Token)
    if (path === '/v1/auth/exchange' && request.method === 'POST') {
      const authHeader = request.headers.get('Authorization') ?? '';
      const idToken    = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!idToken) return jsonResponse({ error: 'Missing Firebase ID Token in Authorization header' }, 401);

      const body = await request.json() as { public_key?: unknown };
      const pk   = typeof body.public_key === 'string' ? body.public_key.trim() : '';
      if (!pk || pk.length > 256) return jsonResponse({ error: 'Invalid public_key' }, 400);

      const verified = await verifyFirebaseIdToken(idToken);
      if (!verified) return jsonResponse({ error: 'Invalid or expired Firebase ID Token' }, 401);

      await env.SEMANTIC_CACHE_KV.put(`api_key:${pk}`, verified.email);
      return jsonResponse({ status: 'linked', email: verified.email });
    }

    // PayPal: Plans endpoint
    if (path === '/v1/paypal/plans' && request.method === 'GET') {
      const hdrs = { ...corsHeaders(), 'Content-Type': 'application/json' };
      try {
        const token = await getPayPalAccessToken(env.PAYPAL_CLIENT_SECRET, env.SEMANTIC_CACHE_KV);
        const planIds: Record<string, string> = {};
        for (const plan of PLANS) {
          let planId = await env.SEMANTIC_CACHE_KV.get(plan.kvKey);
          if (!planId) {
            planId = await createPayPalPlan(token, plan);
            await env.SEMANTIC_CACHE_KV.put(plan.kvKey, planId);
          }
          planIds[plan.kvKey] = planId;
        }
        return new Response(JSON.stringify({ success: true, plans: planIds }), { status: 200, headers: hdrs });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ event: 'paypal_plans_error', error: msg }));
        return new Response(JSON.stringify({ error: 'Failed to fetch plans', detail: msg }), { status: 500, headers: hdrs });
      }
    }

    // PayPal: Webhook (signature-verified)
    if (path === '/v1/paypal/webhook' && request.method === 'POST') {
      const rawBody = await request.text();
      try {
        const accessToken = await getPayPalAccessToken(env.PAYPAL_CLIENT_SECRET, env.SEMANTIC_CACHE_KV);
        const isValid     = await verifyPayPalWebhook(request, rawBody, env.PAYPAL_WEBHOOK_ID, accessToken);
        if (!isValid) {
          console.error(JSON.stringify({ event: 'webhook_signature_invalid' }));
          return jsonResponse({ error: 'Webhook signature verification failed' }, 401);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ event: 'webhook_error', error: msg }));
        return jsonResponse({ error: 'Webhook verification error' }, 500);
      }

      const event     = JSON.parse(rawBody) as { event_type: string; resource: Record<string, unknown> };
      const eventType = event.event_type;
      const resource  = event.resource;
      console.log(JSON.stringify({ event: 'paypal_webhook', eventType }));

      const subscriber   = resource.subscriber as Record<string, string> | undefined;
      const subscriberId = subscriber?.email_address;

      if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED' && subscriberId) {
        await env.SEMANTIC_CACHE_KV.put(`subscription:${subscriberId}`, JSON.stringify({
          status: 'active', plan_id: resource.plan_id, subscription_id: resource.id, activated_at: new Date().toISOString(),
        }));
      }
      if ((eventType === 'BILLING.SUBSCRIPTION.CANCELLED' || eventType === 'BILLING.SUBSCRIPTION.SUSPENDED') && subscriberId) {
        await env.SEMANTIC_CACHE_KV.put(`subscription:${subscriberId}`, JSON.stringify({
          status: eventType === 'BILLING.SUBSCRIPTION.CANCELLED' ? 'cancelled' : 'suspended',
          cancelled_at: new Date().toISOString(),
        }));
      }
      return jsonResponse({ received: true });
    }

    // Authenticated API routes
    if (path.startsWith('/v1/') || path.startsWith('/memory')) {
      const authHeader = request.headers.get('Authorization') ?? '';
      if (!authHeader.startsWith('Bearer ')) return jsonResponse({ error: 'Unauthorized: missing Bearer token' }, 401);

      let payload: { public_key: string; email: string };
      try {
        const secret   = new TextEncoder().encode(env.JWT_SECRET);
        const verified = await jwtVerify(authHeader.slice(7), secret);
        payload = verified.payload as { public_key: string; email: string };
      } catch {
        return jsonResponse({ error: 'Invalid or expired JWT' }, 401);
      }

      const { public_key: tenantId, email } = payload;
      if (!tenantId || !email) return jsonResponse({ error: 'Malformed token payload' }, 401);

      // Subscription check
      const subJson = await env.SEMANTIC_CACHE_KV.get(`subscription:${email}`);
      if (!subJson) return jsonResponse({ error: 'Payment Required: no active subscription.' }, 402);
      let sub: { status: string };
      try { sub = JSON.parse(subJson) as { status: string }; }
      catch { return jsonResponse({ error: 'Subscription record corrupted. Contact support@humem.cloud.' }, 500); }
      if (sub.status !== 'active') return jsonResponse({ error: `Payment Required: subscription is ${sub.status}.` }, 402);

      // Rate limit
      if (await isRateLimited(tenantId, env.SEMANTIC_CACHE_KV)) {
        return jsonResponse({ error: 'Rate limit exceeded. Max 60 requests/minute.' }, 429);
      }

      // SSRF-hardened Linea-1 proxy
      if (path.startsWith('/v1/linea')) {
        const subPath  = path.replace(/^\/v1\/linea/, '') || '/';
        const proxyReq = new Request(`https://linea-1.botvibe.tech${subPath}`, {
          method: request.method, headers: request.headers,
          body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        });
        return fetch(proxyReq);
      }

      // SSRF-hardened OrcaOS proxy
      if (path.startsWith('/v1/orca')) {
        const subPath  = path.replace(/^\/v1\/orca/, '') || '/';
        const proxyReq = new Request(`https://orcaos.botvibe.tech${subPath}`, {
          method: request.method, headers: request.headers,
          body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        });
        return fetch(proxyReq);
      }

      // Route to MemCog Durable Object
      return env.MEMCOG_OBJECT.get(env.MEMCOG_OBJECT.idFromName(tenantId)).fetch(request);
    }

    return jsonResponse({ error: 'Not Found' }, 404);
  },
};
