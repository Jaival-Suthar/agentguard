import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createApp } from "./server.js";

function textResult(result: any): string {
  const item = result.content?.find((entry: any) => entry.type === "text");
  return item?.text ?? "";
}

async function startTestServer() {
  const app = createApp(async (request) => ({
    requestId: request.id,
    approved: true,
    decidedAt: new Date().toISOString(),
    reason: "Integration test approval",
  }));

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Unable to determine test server address");
  }

  return {
    server,
    url: new URL(`http://127.0.0.1:${address.port}/mcp`),
  };
}

async function connectClient(url: URL) {
  const client = new Client({
    name: "agentguard-policy-integration-test",
    version: "1.0.0",
  });

  const transport = new StreamableHTTPClientTransport(url);
  await client.connect(transport);

  return { client, transport };
}

test("real MCP path allows safe lookup", async () => {
  const { server, url } = await startTestServer();
  const { client, transport } = await connectClient(url);

  try {
    const result = await client.callTool({
      name: "lookup_incident",
      arguments: {
        incident_id: "INC-042",
      },
    });

    const payload = JSON.parse(textResult(result));

    assert.equal(result.isError, undefined);
    assert.equal(payload.found, true);
    assert.equal(payload.incident_id, "INC-042");
  } finally {
    await transport.terminateSession().catch(() => {});
    await client.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("real MCP path blocks destructive action before execution", async () => {
  const { server, url } = await startTestServer();
  const { client, transport } = await connectClient(url);

  try {
    const result = await client.callTool({
      name: "delete_incident",
      arguments: {
        incident_id: "INC-042",
      },
    });

    const payload = JSON.parse(textResult(result));

    assert.equal(result.isError, true);
    assert.equal(payload.error, "Blocked by AgentGuard policy");
    assert.equal(payload.decision, "BLOCK");
    assert.equal(
      payload.action,
      "mcp:incident.lookup:delete_incident",
    );
  } finally {
    await transport.terminateSession().catch(() => {});
    await client.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("real MCP path requires and receives approval for rollback", async () => {
  const approvalRequests: string[] = [];

  const app = createApp(async (request) => {
    approvalRequests.push(request.action);

    return {
      requestId: request.id,
      approved: true,
      decidedAt: new Date().toISOString(),
      reason: "Integration test approval",
    };
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Unable to determine test server address");
  }

  const url = new URL(`http://127.0.0.1:${address.port}/mcp`);
  const { client, transport } = await connectClient(url);

  try {
    const result = await client.callTool({
      name: "rollback_incident",
      arguments: {
        incident_id: "INC-042",
      },
    });

    const payload = JSON.parse(textResult(result));

    assert.equal(result.isError, undefined);
    assert.equal(payload.rolled_back, true);
    assert.equal(payload.incident_id, "INC-042");
    assert.deepEqual(approvalRequests, ["operation:rollback"]);
  } finally {
    await transport.terminateSession().catch(() => {});
    await client.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});