# HuMem.cloud — Sovereign Cognitive Architecture

> **⚠️ PROPRIETARY SOFTWARE — Commercial License Required. See [LICENSE](./LICENSE).**

**HuMem.cloud** is an enterprise-grade, edge-native cognitive architecture platform built by **BotVibe AI LLC**. It gives AI agents and LLMs persistent, multimodal, self-repairing memory powered by Cloudflare Durable Objects, SQLite, and Vectorize.

---

## v9.5 Capabilities

| Capability | Description |
|---|---|
| **Multimodal Memory Consolidation** | Ingests text, images, and audio into a unified temporal knowledge graph |
| **Cross-Agent Shared Cognition** | `tenant-local` and `global-shared` memory scopes for agent swarms |
| **Autonomous Self-Repair** | Background `alarm()` dreaming resolves graph contradictions automatically |
| **Predictive Cognitive Load** | Pre-emptively summarizes dense context before agents are overwhelmed |
| **Identity Continuity** | Synthesizes stable long-term user identity profiles across sessions |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  humem.cloud                    │
│  MemCog Durable Object (SQLite + Vectorize)     │
│  Temporal Knowledge Graph + Alarm() Dreaming    │
└──────────────┬────────────────┬────────────────┘
               │                │
    ┌──────────▼──────┐   ┌─────▼──────────────┐
    │    OrcaOS       │   │    Linea-1          │
    │  Multimodal     │   │  Workflow Dispatch  │
    │  Embedding &    │   │  Identity Synth     │
    │  Graph Repair   │   │  & Graph Fixes      │
    └─────────────────┘   └────────────────────┘
```

---

## API Reference

See [docs.humem.cloud/api](https://humem.cloud/api.html) for the full enterprise API reference.

### Quick Start

```bash
# Store a memory
curl -X POST https://humem.cloud/v1/memory/ingest \
  -H "Authorization: Bearer YOUR_HUMEM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"my-agent","role":"user","content":"Remember this fact."}'

# Recall memory
curl -X POST https://humem.cloud/v1/memory/query \
  -H "Authorization: Bearer YOUR_HUMEM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"my-agent","query_string":"What should I remember?"}'
```

---

## Deployment

```bash
# Install dependencies
npm install

# Deploy to Cloudflare
npx wrangler deploy

# Set API key secret
npx wrangler secret put HUMEM_API_KEY
```

---

## Pricing

| Tier | Price | Description |
|---|---|---|
| Developer | $49/mo | Base cognitive load limits |
| Enterprise Scale | $499/mo | Multimodal, shared cognition, auto-repair |
| Unstoppable Core | Custom | Dedicated edge infrastructure |

---

## License

This software is **proprietary and commercially licensed**. You may not use, copy, modify, merge, publish, distribute, sublicense, or sell copies of this software without a valid paid license from BotVibe AI LLC.

See [LICENSE](./LICENSE) for full terms.

---

**Built by BotVibe AI LLC — Clintwood, Virginia**  
📧 support@botvibe.ai | 🌐 [humem.cloud](https://humem.cloud) | 🌐 [botvibe.ai](https://botvibe.ai)
