import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const HOST = process.env.HOST ?? "127.0.0.1";

const PORT = Number(process.env.PORT ?? "8783");

const CHAOS_MODE =
  process.env.CHAOS_MODE ?? "malformed-result";

const CHAOS_DELAY_MS = Number(
  process.env.CHAOS_DELAY_MS ?? "15000",
);

type ChaosMode =
  | "malformed-result"
  | "timeout"
  | "fail-once";

function getChaosMode(): ChaosMode {
  if (
    CHAOS_MODE === "malformed-result" ||
    CHAOS_MODE === "timeout" ||
    CHAOS_MODE === "fail-once"
  ) {
    return CHAOS_MODE;
  }

  throw new Error(
    `Unsupported CHAOS_MODE "${CHAOS_MODE}". Expected "malformed-result", "timeout", or "fail-once".`,
  );
}

let failOnceCallCount = 0;

function createIncidentServer(): McpServer {
  const mode = getChaosMode();

  const server = new McpServer({
    name: "agentguard-chaos-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "lookup_incident",
    {
      title: "Chaos Incident Lookup",
      description:
        "Synthetic incident lookup with deterministic fault injection for AgentGuard testing.",
      inputSchema: z.object({
        incident_id: z
          .string()
          .describe("Synthetic incident ID"),
      }),
    },
    async ({ incident_id }) => {
      console.log(
        `[CHAOS] lookup_incident called with incident_id=${incident_id} mode=${mode}`,
      );

      if (mode === "timeout") {
        console.log(
          `[CHAOS] forcing timeout failure for incident_id=${incident_id}`,
        );

        await new Promise<void>((resolve) => {
          setTimeout(resolve, CHAOS_DELAY_MS);
        });

        throw new Error(
          `Chaos MCP timeout injected for incident ${incident_id}`,
        );
      }

      const shouldFailOnce =
        mode === "fail-once" && failOnceCallCount === 0;

      failOnceCallCount += 1;

      if (mode === "malformed-result" || shouldFailOnce) {
        console.log(
          `[CHAOS] returning malformed result for incident_id=${incident_id} call=${failOnceCallCount}`,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `{"found":true,"incident_id":"${incident_id}"`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              found: true,
              incident_id,
              service: "analytics",
              severity: "high",
              status: "investigating",
              suspected_component: "nightly-worker",
            }),
          },
        ],
      };
    },
  );

  return server;
}

const app = createMcpExpressApp({
  host: HOST,
});

app.post("/mcp", async (req, res) => {
  const transport =
    new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

  const server = createIncidentServer();

  await server.connect(transport);

  await transport.handleRequest(
    req,
    res,
    req.body,
  );
});

app.get("/mcp", (_req, res) => {
  res.status(405).json({
    error: "MCP endpoint accepts POST requests.",
  });
});

app.delete("/mcp", (_req, res) => {
  res.status(405).json({
    error:
      "Stateless MCP server does not support DELETE.",
  });
});

app.listen(PORT, HOST, () => {
  console.log(
    `AgentGuard Chaos MCP listening on http://${HOST}:${PORT}/mcp`,
  );

  console.log(
    `Chaos mode: ${CHAOS_MODE}`,
  );
});
