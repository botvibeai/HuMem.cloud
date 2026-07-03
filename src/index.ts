import { DurableObjectNamespace } from '@cloudflare/workers-types';
export { MemCogDurableObject } from './MemCogDurableObject';

export interface Env {
  MEMCOG_OBJECT: DurableObjectNamespace;
  SEMANTIC_CACHE_KV: any;
  ANALYTIC: any;
  AI: any;
  // TODO: Re-add when linea-1 and orca workers are resolved
  // linea_1: any;
  // orca: any;
}

// Utility to verify cryptographic Ed25519 signatures
async function verifyEd25519Signature(
  publicKeyHex: string,
  signatureHex: string,
  messageText: string
): Promise<boolean> {
  try {
    const pubKeyBuffer = Uint8Array.from(Buffer.from(publicKeyHex, 'hex'));
    const sigBuffer = Uint8Array.from(Buffer.from(signatureHex, 'hex'));
    const msgBuffer = new TextEncoder().encode(messageText);

    const importedKey = await crypto.subtle.importKey(
      'raw',
      pubKeyBuffer,
      { name: 'NODE-ED25519', namedCurve: 'NODE-ED25519' },
      true,
      ['verify']
    );

    return await crypto.subtle.verify(
      'NODE-ED25519',
      importedKey,
      sigBuffer,
      msgBuffer
    );
  } catch (error) {
    return false;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Route: Challenge-Response Auth Generation
    if (path === '/v1/auth/challenge' && request.method === 'POST') {
      const { public_key } = await request.json() as { public_key: string };
      if (!public_key) {
        return new Response(JSON.stringify({ error: 'Missing public key' }), { status: 400 });
      }

      const challenge = crypto.randomUUID();
      // Store challenge in KV with a 30-second TTL
      await env.SEMANTIC_CACHE_KV.put(`challenge:${public_key}`, challenge, { expirationTtl: 30 });

      return new Response(JSON.stringify({ challenge }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Route: Challenge-Response Verify & JWT Issue
    if (path === '/v1/auth/verify' && request.method === 'POST') {
      const { public_key, signature } = await request.json() as { public_key: string, signature: string };
      const storedChallenge = await env.SEMANTIC_CACHE_KV.get(`challenge:${public_key}`);

      if (!storedChallenge) {
        return new Response(JSON.stringify({ error: 'Challenge expired or missing' }), { status: 401 });
      }

      const isValid = await verifyEd25519Signature(public_key, signature, storedChallenge);
      if (!isValid) {
        return new Response(JSON.stringify({ error: 'Signature mismatch' }), { status: 401 });
      }

      // Generate a mock JWT token (HMAC-SHA256 signature logic would be inlined in production)
      const token = `jwt_${public_key}_${Date.now()}`;
      await env.SEMANTIC_CACHE_KV.put(`token:${token}`, public_key, { expirationTtl: 86400 });

      return new Response(JSON.stringify({ token, status: 'authenticated' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if it's an API route (/v1/ or /memory)
    if (path.startsWith('/v1/') || path.startsWith('/memory')) {
      // Standard API Authorization Barrier
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized bearer missing' }), { status: 401 });
      }

      const token = authHeader.substring(7);
      const tenantId = await env.SEMANTIC_CACHE_KV.get(`token:${token}`);
      if (!tenantId) {
        return new Response(JSON.stringify({ error: 'Session expired' }), { status: 401 });
      }

      // Proxy to Linea-1 System Controller
      if (path.startsWith('/v1/linea')) {
        const targetUrl = new URL(request.url);
        targetUrl.hostname = 'linea-1.botvibe.tech';
        // Keep the full path or strip the prefix, depending on what linea-1 expects.
        // Usually, an API gateway forwards the same path.
        const proxyReq = new Request(targetUrl.toString(), request);
        return fetch(proxyReq);
      }

      // Proxy to OrcaOS Planning Engine
      if (path.startsWith('/v1/orca')) {
        const targetUrl = new URL(request.url);
        targetUrl.hostname = 'orcaos.botvibe.tech';
        const proxyReq = new Request(targetUrl.toString(), request);
        return fetch(proxyReq);
      }

      // Routing authenticated traffic to the unique Durable Object node
      const objectId = env.MEMCOG_OBJECT.idFromName(tenantId);
      const stub = env.MEMCOG_OBJECT.get(objectId);
      return stub.fetch(request);
    }

    // Fallback for any other unmatched routes
    return new Response('Not Found', { status: 404 });
  }
};
