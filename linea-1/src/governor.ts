import { Agent, callable } from "agents";

export interface ExecutionTelemetry {
  serviceId: string;
  cpuTime: number;
  memoryUsed: number;
  success: boolean;
}

export interface ArtifactDeployment {
  buildId: string;
  version: string;
  parentVersion?: string;
  checksum: string;
  status: "deployed" | "failed" | "rolled-back";
  rollbackTarget?: string;
}

export interface SystemStatus {
  activeServices: Record<string, {
    version: string;
    totalInvocations: number;
    averageCpuMs: number;
    peakMemoryMb: number;
    failureRatio: number;
    status: "healthy" | "unstable" | "quarantined";
  }>;
}

export class GovernanceAgent extends Agent<any, SystemStatus> {
  initialState: SystemStatus = {
    activeServices: {}
  };

  async onStart(): Promise<void> {
    // Initialize the governance log structure in the SQLite database
    this.sql`
      CREATE TABLE IF NOT EXISTS telemetry_records (
        record_id TEXT PRIMARY KEY,
        service_id TEXT,
        cpu_duration_ms INTEGER,
        memory_usage_mb REAL,
        is_successful INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Initialize artifact registry
    this.sql`
      CREATE TABLE IF NOT EXISTS artifact_registry (
        build_id TEXT PRIMARY KEY,
        version TEXT,
        parent_version TEXT,
        checksum TEXT,
        status TEXT,
        rollback_target TEXT,
        deployed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 9.5 Upgrade: Identity Continuity
    this.sql`
      CREATE TABLE IF NOT EXISTS identity_beliefs (
        tenant_id TEXT,
        belief_key TEXT,
        belief_value TEXT,
        confidence REAL,
        PRIMARY KEY (tenant_id, belief_key)
      )
    `;
  }

  @callable()
  async registerArtifact(data: ArtifactDeployment): Promise<void> {
    this.sql`
      INSERT OR REPLACE INTO artifact_registry (
        build_id, version, parent_version, checksum, status, rollback_target
      ) VALUES (
        ${data.buildId}, 
        ${data.version}, 
        ${data.parentVersion || null}, 
        ${data.checksum}, 
        ${data.status}, 
        ${data.rollbackTarget || null}
      )
    `;
  }

  @callable()
  async logTelemetry(data: ExecutionTelemetry): Promise<void> {
    const recordId = crypto.randomUUID();
    this.sql`
      INSERT INTO telemetry_records (record_id, service_id, cpu_duration_ms, memory_usage_mb, is_successful)
      VALUES (${recordId}, ${data.serviceId}, ${data.cpuTime}, ${data.memoryUsed}, ${data.success ? 1 : 0})
    `;

    const service = this.state.activeServices[data.serviceId] || {
      version: "1.0.0",
      totalInvocations: 0,
      averageCpuMs: 0,
      peakMemoryMb: 0,
      failureRatio: 0,
      status: "healthy"
    };

    const newInvocations = service.totalInvocations + 1;
    service.totalInvocations = newInvocations;
    service.averageCpuMs = (service.averageCpuMs * (newInvocations - 1) + data.cpuTime) / newInvocations;
    service.peakMemoryMb = Math.max(service.peakMemoryMb, data.memoryUsed);

    const outcomeVal = data.success ? 0 : 1;
    service.failureRatio = (service.failureRatio * (newInvocations - 1) + outcomeVal) / newInvocations;

    // Trigger an alert if the service failure rate exceeds 12%
    if (service.failureRatio > 0.12 && service.status !== "quarantined") {
      service.status = "unstable";
    }

    this.state.activeServices[data.serviceId] = service;
    this.setState({ activeServices: this.state.activeServices });
  }

  @callable()
  async getServiceStatus(serviceId: string): Promise<string> {
    const service = this.state.activeServices[serviceId];
    return service ? service.status : "unknown";
  }

  @callable()
  async synthesizeIdentityContinuity(): Promise<void> {
    // 9.5 Upgrade: Identity Continuity
    // Fetch long-term left/right brain context from HuMem to build a stable identity profile
    try {
      const response = await fetch('https://humem-cloud.michael-38d.workers.dev/v1/memory/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           query_string: "core user identity traits",
           current_time: new Date().toISOString(),
           scope: 'global-shared'
        })
      });
      const data = await response.json() as any;
      
      if (data.results && data.results.length > 0) {
        this.sql`
          INSERT OR REPLACE INTO identity_beliefs (tenant_id, belief_key, belief_value, confidence)
          VALUES ('system-tenant', 'core_profile', 'Synthesized ' || ${data.results.length} || ' facts', 0.95)
        `;
      }
    } catch (e) {
      console.error("Identity Continuity synthesis failed", e);
    }
  }

  @callable()
  async applyGraphFixes(fixes: any[]): Promise<void> {
    // 9.5 Upgrade: Autonomous Self-Repair
    // Linea-1 applies graph fixes determined by OrcaOS to HuMem
    console.log("Applying graph fixes:", fixes);
    // In production, this iterates through fixes and issues DELETE/UPDATE to HuMem graph endpoints
  }
}
