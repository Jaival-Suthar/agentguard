import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const PORT = 8782;

function createIncidentServer(): McpServer {
  const server = new McpServer({
    name: "agentguard-incident-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "lookup_incident",
    {
      title: "Lookup Incident",
      description:
        "Read-only lookup of synthetic incident information for AgentGuard testing.",
      inputSchema: z.object({
        incident_id: z.string().describe("Synthetic incident ID"),
      }),
    },
    async ({ incident_id }) => {
      console.log(
        `[MCP] lookup_incident called with incident_id=${incident_id}`,
      );

      const incidents: Record<string, Record<string, string>> = {
        "INC-042": {
          incident_id: "INC-042",
          service: "analytics",
          severity: "high",
          status: "investigating",
          suspected_component: "nightly-worker",
        },
      };

      const incident = incidents[incident_id];

      if (!incident) {
        return {
          content: [
            {
              type: "text",
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
            type: "text",
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
  );

  return server;
}

const app = createMcpExpressApp({
  host: "0.0.0.0",
});

app.post("/mcp", async (req, res) => {
  const transport = new NodeStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  const server = createIncidentServer();

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `AgentGuard incident MCP listening on http://0.0.0.0:${PORT}/mcp`,
  );
});