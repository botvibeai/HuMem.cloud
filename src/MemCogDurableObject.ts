export class MemCogDurableObject {
  private state: DurableObjectState;
  private initialized: boolean = false;

  // Type for a single memory item used in batch ingest
  private static readonly MEMORY_ITEM_SCHEMA = true;

  constructor(state: DurableObjectState, env: unknown) {
    this.state = state;
  }

  // Ensures SQLite schemas and indices are initialized on first access
  private async initDatabase(): Promise<void> {
    if (this.initialized) return;

    // Create structured tables for ReMemory, HuMem tracks, and MemCog1 optimization states
    await this.state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS rememory_nodes (
        id TEXT PRIMARY KEY,
        fact TEXT NOT NULL,
        category TEXT,
        valid_from TEXT NOT NULL,
        valid_to TEXT,
        invalid_at TEXT
      );

      CREATE TABLE IF NOT EXISTS humem_grains (
        id TEXT PRIMARY KEY,
        media_url TEXT NOT NULL,
        vibe_context TEXT,
        created_timestamp TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memcog1_optimization (
        node_id TEXT PRIMARY KEY,
        importance REAL NOT NULL,
        recall_count INTEGER DEFAULT 0,
        last_accessed TEXT NOT NULL,
        decay_constant REAL DEFAULT 0.05
      );

      CREATE INDEX IF NOT EXISTS idx_rememory_temporal ON rememory_nodes(valid_from, valid_to);
      CREATE INDEX IF NOT EXISTS idx_memcog_strength ON memcog1_optimization(importance, last_accessed);
    `);

    // 9.5 Upgrade: Schema evolution for Multimodality, Scopes, and Cognitive Load
    try { await this.state.storage.sql.exec("ALTER TABLE rememory_nodes ADD COLUMN scope TEXT DEFAULT 'tenant-local'"); } catch(e) {}
    try { await this.state.storage.sql.exec("ALTER TABLE rememory_nodes ADD COLUMN modality TEXT DEFAULT 'text'"); } catch(e) {}
    try { await this.state.storage.sql.exec("ALTER TABLE rememory_nodes ADD COLUMN media_ref TEXT"); } catch(e) {}
    try { await this.state.storage.sql.exec("ALTER TABLE memcog1_optimization ADD COLUMN context_pressure REAL DEFAULT 0"); } catch(e) {}

    this.initialized = true;
  }

  async fetch(request: Request): Promise<Response> {
    await this.initDatabase();
    const url = new URL(request.url);
    const path = url.pathname;

    // API Route: Ingest Memory
    if (path === '/v1/memory/ingest' && request.method === 'POST') {
      const body = await request.json() as any;
      const { id, fact, category, valid_from, importance, scope = 'tenant-local', modality = 'text', media_ref = null } = body;

      // Executing a transactional write to the embedded SQLite database
      await this.state.storage.sql.exec(`
        INSERT INTO rememory_nodes (id, fact, category, valid_from, scope, modality, media_ref)
        VALUES (?, ?, ?, ?, ?, ?, ?);
      `, id, fact, category, valid_from, scope, modality, media_ref);

      // Register the metadata parameters under MemCog1 supervision
      await this.state.storage.sql.exec(`
        INSERT INTO memcog1_optimization (node_id, importance, last_accessed)
        VALUES (?, ?, ?);
      `, id, importance, new Date().toISOString());

      // Schedule the next background Dreaming Alarm in 6 hours
      await this.state.storage.setAlarm(Date.now() + 6 * 60 * 60 * 1000);

      return new Response(JSON.stringify({ status: 'committed', node_id: id }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // API Route: Batch Ingest Memory
    if (path === '/v1/memory/ingest/batch' && request.method === 'POST') {
      const body = await request.json() as { memories?: unknown[] };
      const { memories } = body;
      if (!Array.isArray(memories)) {
        return new Response(JSON.stringify({ error: 'memories must be an array' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      if (memories.length > 100) {
        return new Response(JSON.stringify({ error: 'Batch limit is 100 memories per request' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      
      const now = new Date().toISOString();
      let count = 0;

      await this.state.storage.sql.exec('BEGIN TRANSACTION;');
      try {
        for (const item of memories) {
          const mem = item as { id: string; fact: string; category: string; valid_from: string; importance: number; scope?: string; modality?: string; media_ref?: string | null };
          const { id, fact, category, valid_from, importance, scope = 'tenant-local', modality = 'text', media_ref = null } = mem;
          await this.state.storage.sql.exec(`
            INSERT INTO rememory_nodes (id, fact, category, valid_from, scope, modality, media_ref)
            VALUES (?, ?, ?, ?, ?, ?, ?);
          `, id, fact, category, valid_from, scope, modality, media_ref);

          await this.state.storage.sql.exec(`
            INSERT INTO memcog1_optimization (node_id, importance, last_accessed)
            VALUES (?, ?, ?);
          `, id, importance, now);
          count++;
        }
        await this.state.storage.sql.exec('COMMIT;');
      } catch (err) {
        await this.state.storage.sql.exec('ROLLBACK;');
        return new Response(JSON.stringify({ error: 'Batch insert failed' }), { status: 500 });
      }

      await this.state.storage.setAlarm(Date.now() + 6 * 60 * 60 * 1000);

      return new Response(JSON.stringify({ status: 'batch_committed', count }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // API Route: Temporal and Semantic Local Query
    if (path === '/v1/memory/query' && request.method === 'POST') {
      const body = await request.json() as any;
      const { query_string, current_time, category, scope = 'tenant-local' } = body;

      // Run temporal scan, filtering out invalid or expired database nodes.
      let querySql = `
        SELECT n.id, n.fact, n.category, n.scope, n.modality, n.media_ref, o.importance, o.recall_count
        FROM rememory_nodes n
        JOIN memcog1_optimization o ON n.id = o.node_id
        WHERE datetime(?) >= datetime(n.valid_from)
          AND (n.valid_to IS NULL OR datetime(?) <= datetime(n.valid_to))
          AND (n.invalid_at IS NULL)
          AND (n.scope = 'global-shared' OR n.scope = ?)
      `;
      let queryParams = [current_time, current_time, scope];

      if (category) {
        querySql += ` AND n.category = ?`;
        queryParams.push(category);
      }

      const cursor = await this.state.storage.sql.exec(querySql, ...queryParams);

      const results = cursor.toArray();

      // 9.5 Upgrade: Predictive Cognitive Load Management
      // If a single category yields too many facts, context pressure spikes.
      if (category && results.length > 50) {
        // Asynchronously trigger OrcaOS to summarize this dense cluster
        void fetch('https://orcaos.botvibe.tech/route/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, nodeIds: results.map(r => r.id) })
        }).catch(() => {});
      }

      // Track active memory usage and increment recall counts
      if (results.length > 0) {
        const placeholders = results.map(() => '?').join(',');
        const ids = results.map((r: Record<string, unknown>) => r.id as string);
        const now = new Date().toISOString();
        
        await this.state.storage.sql.exec(`
          UPDATE memcog1_optimization
          SET recall_count = recall_count + 1,
              last_accessed = ?
          WHERE node_id IN (${placeholders});
        `, now, ...ids);
      }

      return new Response(JSON.stringify({ results }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Endpoint mismatch within Durable Object' }), { status: 404 });
  }

  // Background Alarm Dreaming Loop execution
  async alarm(): Promise<void> {
    await this.initDatabase();

    // Fetch optimization metadata from SQLite storage
    const cursor = await this.state.storage.sql.exec(`
      SELECT node_id, importance, recall_count, last_accessed, decay_constant
      FROM memcog1_optimization;
    `);

    const records = cursor.toArray();
    const now = new Date();

    // Collect IDs of memories whose strength has fallen below the retention threshold
    const decayedIds: string[] = [];
    for (const record of records) {
      const lastAccess = new Date(record.last_accessed as string);
      const diffDays   = Math.abs(now.getTime() - lastAccess.getTime()) / (1000 * 60 * 60 * 24);

      // Ebbinghaus Forgetting Curve
      const lambda     = record.decay_constant as number;
      const r          = record.recall_count   as number;
      const importance = record.importance     as number;
      const strength   = importance * Math.exp(-lambda * diffDays) * (1 + r * 0.2);

      if (strength < 0.15) {
        decayedIds.push(record.node_id as string);
      }
    }

    // Batch DELETE all decayed nodes in two queries instead of N*2 queries
    if (decayedIds.length > 0) {
      const placeholders = decayedIds.map(() => '?').join(',');
      await this.state.storage.sql.exec(
        `DELETE FROM rememory_nodes       WHERE id      IN (${placeholders});`,
        ...decayedIds
      );
      await this.state.storage.sql.exec(
        `DELETE FROM memcog1_optimization WHERE node_id IN (${placeholders});`,
        ...decayedIds
      );
    }

    // 9.5 Upgrade: Autonomous Self-Repair
    const conflicts     = await this.state.storage.sql.exec(`
      SELECT category, COUNT(id) as count
      FROM rememory_nodes
      WHERE invalid_at IS NULL
      GROUP BY category
      HAVING count > 100;
    `);
    const conflictRows = conflicts.toArray();

    if (conflictRows.length > 0) {
      void fetch('https://orcaos.botvibe.tech/route/conflict-resolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve-conflicts', anomalies: conflictRows })
      }).catch((err: unknown) => {
        console.error(JSON.stringify({ event: 'orcaos_conflict_resolution_failed', error: String(err) }));
      });
    }

    // Optimize the embedded database to reclaim space
    await this.state.storage.sql.exec('PRAGMA optimize;');
  }
}
