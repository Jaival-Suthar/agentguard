import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { loadExecutionContract } from "../../src/contract/index.js";
import {
  ApprovalDeniedError,
  PolicyBlockedError,
  PolicyGate,
} from "../../src/policy/index.js";
import type {
  ApprovalRequest,
  PolicyDecisionEvent,
  PolicyGateOptions,
} from "../../src/policy/index.js";

const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number(process.env.PORT ?? "8782");

const CONTRACT_PATH = fileURLToPath(
  new URL("../../contracts/incident-investigation.yaml", import.meta.url),
);

function logPolicyEvent(event: PolicyDecisionEvent): void {
  console.log(JSON.stringify(event));
}

/**
 * Serializes approval prompts so only one operation can read terminal input
 * at a time. This prevents one terminal response from authorizing multiple
 * concurrent approval requests.
 */
export function createSerializedApprovalRequester(
  prompt: (request: ApprovalRequest) => Promise<string>,
): NonNullable<PolicyGateOptions["requestApproval"]> {
  let queue = Promise.resolve();

  return async (request: ApprovalRequest) => {
    const previous = queue;

    let release!: () => void;

    queue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      const answer = await prompt(request);
      const approved = answer.trim().toLowerCase() === "y";

      return {
        requestId: request.id,
        approved,
        decidedAt: new Date().toISOString(),
        ...(approved ? {} : { reason: "Human approval denied" }),
      };
    } catch {
      return {
        requestId: request.id,
        approved: false,
        decidedAt: new Date().toISOString(),
        reason: "Approval prompt failed; failing closed",
      };
    } finally {
      release();
    }
  };
}

const serializedHumanApproval: NonNullable<
  PolicyGateOptions["requestApproval"]
> = createSerializedApprovalRequester(
  async (request) => {
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      return await readline.question(
        `\n[AgentGuard] APPROVAL REQUIRED\nAction: ${request.action}\nReason: ${request.reason}\nApprove? [y/N] `,
      );
    } finally {
      readline.close();
    }
  },
);

async function requestHumanApproval(request: ApprovalRequest) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return {
      requestId: request.id,
      approved: false,
      decidedAt: new Date().toISOString(),
      reason: "No interactive approval channel is available; failing closed",
    };
  }

  return serializedHumanApproval(request);
}

export function createPolicyGate(
  requestApproval: PolicyGateOptions["requestApproval"] =
    requestHumanApproval,
) {
  return new PolicyGate({
    onDecision: logPolicyEvent,
    requestApproval,
  });
}

function policyErrorResponse(error: unknown) {
  if (error instanceof PolicyBlockedError) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: "Blocked by AgentGuard policy",
            decision: error.decision.decision,
            action: error.decision.action,
            reason: error.decision.reason,
          }),
        },
      ],
      isError: true,
    };
  }

  if (error instanceof ApprovalDeniedError) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: "Approval denied by AgentGuard policy",
            decision: "BLOCK",
            action: error.decision.action,
            requestId: error.requestId,
            reason: error.decision.reason,
          }),
        },
      ],
      isError: true,
    };
  }

  throw error;
}

export async function createIncidentServer(
  requestApproval: PolicyGateOptions["requestApproval"] =
    requestHumanApproval,
): Promise<McpServer> {
  const contract = await loadExecutionContract(CONTRACT_PATH);
  const gate = createPolicyGate(requestApproval);

  const server = new McpServer({
    name: "agentguard-incident-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "lookup_incident",
    {
      title: "Lookup Incident",
      description:
        "Read-only lookup of synthetic incident metadata and diagnostic evidence for AgentGuard testing.",
      inputSchema: z.object({
        incident_id: z.string().describe("Synthetic incident ID"),
      }),
    },
    async ({ incident_id }) => {
      try {
        return (
          await gate.execute(
            "mcp:incident.lookup:lookup_incident",
            contract,
            async () => {
              console.log(
                `[MCP] lookup_incident called with incident_id=${incident_id}`,
              );

              const incidents: Record<
                string,
                Record<string, unknown>
              > = {
                "INC-042": {
                  incident_id: "INC-042",
                  service: "analytics",
                  severity: "high",
                  status: "investigating",
                  suspected_component: "nightly-worker",

                  /*
                   * Deterministic synthetic diagnostic evidence.
                   *
                   * This is intentionally returned by the read-only MCP
                   * lookup rather than invented by the agent. The sandbox
                   * independently validates these facts before deriving
                   * the root-cause candidate.
                   */
                  evidence: {
                    deployment: {
                      component: "nightly-worker",
                      version: "4c21",
                      previous_version: "4c20",
                      deployed_at: "2026-08-30T10:42:00Z",
                    },

                    configuration: {
                      worker_concurrency: 32,
                      database_pool_size: 20,
                    },

                    metrics: {
                      error_rate_percent: 18.7,
                      database_connection_exhaustion: true,
                      queue_depth: 18420,
                    },

                    logs: [
                      "2026-08-30T10:43:11Z ERROR nightly-worker database connection pool exhausted deployment=4c21",
                      "2026-08-30T10:43:18Z ERROR nightly-worker unable to acquire database connection deployment=4c21",
                      "2026-08-30T10:44:02Z WARN nightly-worker queue depth exceeded recovery threshold deployment=4c21",
                    ],
                  },
                },
              };

              const incident = incidents[incident_id];

              if (!incident) {
                return {
                  content: [
                    {
                      type: "text" as const,
                      text: JSON.stringify(
                        {
                          incident_id,
                          found: false,
                        },
                        null,
                        2,
                      ),
                    },
                  ],
                };
              }

              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      {
                        found: true,
                        ...incident,
                      },
                      null,
                      2,
                    ),
                  },
                ],
              };
            },
            {
              source: "mcp",
              actor: "trueforge",
            },
          )
        ).result;
      } catch (error) {
        return policyErrorResponse(error);
      }
    },
  );

  server.registerTool(
    "delete_incident",
    {
      title: "Delete Incident (Policy Fixture)",
      description:
        "Synthetic destructive action used to prove AgentGuard blocks unsafe execution.",
      inputSchema: z.object({
        incident_id: z.string().describe("Synthetic incident ID"),
      }),
    },
    async ({ incident_id }) => {
      try {
        return (
          await gate.execute(
            "mcp:incident.lookup:delete_incident",
            contract,
            async () => {
              console.log(
                `[MCP] delete_incident EXECUTED incident_id=${incident_id}`,
              );

              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({
                      deleted: true,
                      incident_id,
                    }),
                  },
                ],
              };
            },
            {
              source: "mcp",
              actor: "trueforge",
            },
          )
        ).result;
      } catch (error) {
        return policyErrorResponse(error);
      }
    },
  );

  server.registerTool(
    "rollback_incident",
    {
      title: "Rollback Incident (Approval Fixture)",
      description:
        "Synthetic sensitive action used to prove AgentGuard requires approval before execution.",
      inputSchema: z.object({
        incident_id: z.string().describe("Synthetic incident ID"),
      }),
    },
    async ({ incident_id }) => {
      try {
        return (
          await gate.execute(
            "operation:rollback",
            contract,
            async () => {
              console.log(
                `[MCP] rollback_incident EXECUTED incident_id=${incident_id}`,
              );

              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({
                      rolled_back: true,
                      incident_id,
                    }),
                  },
                ],
              };
            },
            {
              source: "mcp",
              actor: "trueforge",
            },
          )
        ).result;
      } catch (error) {
        return policyErrorResponse(error);
      }
    },
  );

  return server;
}

export function createApp(
  requestApproval: PolicyGateOptions["requestApproval"] =
    requestHumanApproval,
) {
  const app = createMcpExpressApp({
    host: HOST,
  });

  app.post("/mcp", async (req, res) => {
    try {
      const transport = new NodeStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      const server = await createIncidentServer(requestApproval);

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("[MCP] request handling failed", error);

      if (!res.headersSent) {
        res.status(500).json({
          error: "MCP request failed",
        });
      }
    }
  });

  app.get("/mcp", (_req, res) => {
    res.status(405).json({
      error: "MCP endpoint accepts POST requests.",
    });
  });

  app.delete("/mcp", (_req, res) => {
    res.status(405).json({
      error: "Stateless MCP server does not support DELETE.",
    });
  });

  return app;
}

async function startServer(): Promise<void> {
  const app = createApp();

  app.listen(PORT, HOST, () => {
    console.log(
      `AgentGuard incident MCP listening on http://${HOST}:${PORT}/mcp`,
    );
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await startServer();
}