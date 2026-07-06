# Linea-1 — Dynamic Workflow Orchestration Engine

> **⚠️ PROPRIETARY SOFTWARE — Commercial License Required. See [LICENSE](./LICENSE).**

**Linea-1** is BotVibe AI LLC's enterprise-grade dynamic workflow dispatch and identity orchestration engine. It coordinates the three-layer BotVibe Intelligence Stack by managing long-horizon reasoning, identity continuity synthesis, and autonomous graph repair across the HuMem.cloud cognitive architecture.

---

## Capabilities

| Capability | Description |
|---|---|
| **Dynamic Workflow Dispatch** | Spawns isolated tenant workflows on-demand via Cloudflare Workers Loaders |
| **GovernanceAgent (Durable Object)** | Tracks services, artifacts, telemetry, and identity beliefs in SQLite |
| **Identity Continuity** | Queries HuMem.cloud to build stable long-term user identity profiles |
| **Autonomous Graph Repair** | Applies structural fixes to HuMem's memory graph via `/apply-graph-fixes` |
| **Cognitive Load Management** | Monitors service health and prevents runaway execution via stability checks |

---

## Architecture

```
Linea-1 (Dispatcher)
  │
  ├── GovernanceAgent (Durable Object)
  │     ├── identity_beliefs table
  │     ├── artifact_registry table
  │     └── telemetry_log table
  │
  └── DynamicWorkflowEngine (Workflows)
        └── Per-tenant isolated workflows
```

---

## Key Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/run-task?tenantId=X` | Dispatch a dynamic tenant workflow |
| `GET` | `/synthesize-identity` | Trigger HuMem identity continuity synthesis |
| `POST` | `/apply-graph-fixes` | Apply autonomous memory graph repair patches |

---

## Deployment

```bash
npm install
npx wrangler deploy
```

---

## License

This software is **proprietary and commercially licensed**. See [LICENSE](./LICENSE) for full terms.

**Built by BotVibe AI LLC — Clintwood, Virginia**
📧 support@botvibe.ai | 🌐 [botvibe.ai](https://botvibe.ai)
