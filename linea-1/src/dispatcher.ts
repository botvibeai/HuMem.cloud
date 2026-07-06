import {
  createDynamicWorkflowEntrypoint,
  DynamicWorkflowBinding,
  wrapWorkflowBinding
} from "dynamic-workflows";
import { getAgentByName } from "agents";
import { GovernanceAgent } from "./governor";

export { GovernanceAgent, DynamicWorkflowBinding };

interface Env {
  LOADER: any;
  WORKFLOW_BINDING: any; // Using any for workflow binding type if missing
  GovernanceAgent: DurableObjectNamespace<GovernanceAgent>;
}

// Create the dynamic workflows entrypoint class
export const DynamicWorkflowEngine = createDynamicWorkflowEntrypoint<Env>(
  async ({ metadata, env }) => {
    const { tenantId, buildVersion } = metadata as { tenantId: string; buildVersion: string };
    const workerId = `${tenantId}-v${buildVersion}`;

    // LOADER.get(id, factoryCallback) — the callback is invoked only when the isolate
    // is not already cached. It must return a WorkerCode object.
    // mainModule specifies the ESM entry, modules is a Record<filename, content>.
    const targetWorker = await env.LOADER.get(workerId, async () => {
      // In production this would fetch the artifact from KV / R2 / Artifacts store.
      // For now we return a minimal stub workflow that the Workflows engine can execute.
      return {
        compatibilityDate: "2026-07-01",
        mainModule: "index.js",
        modules: {
          "index.js": `
            import { WorkflowEntrypoint } from "cloudflare:workers";
            export class TenantWorkflow extends WorkflowEntrypoint {
              async run(event, step) {
                const result = await step.do("execute", async () => {
                  return { tenantId: "${tenantId}", version: "${buildVersion}", status: "executed" };
                });
                return result;
              }
            }
          `
        },
        globalOutbound: null,
      };
    });

    // getEntrypoint() returns a WorkflowRunner-compatible object with a run() method
    return targetWorker.getEntrypoint("TenantWorkflow") as any;
  }
);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const tenantId = url.searchParams.get("tenantId") || "system-tenant";
    const buildVersion = url.searchParams.get("version") || "1.0.0";
    
    // Obtain a stub for the tenant's Governance Agent
    const governorStub = await getAgentByName(env.GovernanceAgent, tenantId);
    
    if (url.pathname === "/run-task") {
      // Check the service status before initiating execution
      // @ts-ignore
      const currentStatus = await governorStub.getServiceStatus("workflow-service");
      
      if (currentStatus === "unstable") {
        // Run the task asynchronously in a fiber to prevent WebSocket blocking
        ctx.waitUntil(
          // @ts-ignore
          governorStub.logTelemetry({
            serviceId: "workflow-service",
            cpuTime: 0,
            memoryUsed: 0,
            success: false
          })
        );
        return new Response("Service status is unstable. Initiating evolution cycle.", { status: 429 });
      }
      
      // Wrap the workflow binding with metadata
      const dynamicBinding = wrapWorkflowBinding(
        { tenantId, buildVersion },
        { bindingName: "WORKFLOW_BINDING" }
      );
      
      // Initialize the dynamic workflow instance
      const payload = await request.json();
      // @ts-ignore
      const workflowInstance = await dynamicBinding.create({
        params: {
          taskData: payload
        }
      });
      
      return Response.json({
        // @ts-ignore
        instanceId: await workflowInstance.id,
        status: "processing"
      });
    }
    
    // 9.5 Upgrade: Identity Continuity and Autonomous Repair endpoints
    if (url.pathname === "/synthesize-identity") {
      // @ts-ignore
      ctx.waitUntil(governorStub.synthesizeIdentityContinuity());
      return new Response(JSON.stringify({ status: "identity synthesis triggered" }), { status: 202 });
    }

    if (url.pathname === "/apply-graph-fixes" && request.method === "POST") {
      const payload = await request.json() as any;
      // @ts-ignore
      ctx.waitUntil(governorStub.applyGraphFixes(payload.fixes || []));
      return new Response(JSON.stringify({ status: "graph fixes triggered" }), { status: 202 });
    }

    return new Response("System online", { status: 200 });
  }
};
