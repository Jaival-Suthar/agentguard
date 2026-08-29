import "dotenv/config";
import { TrueForge } from "@truefoundry/trueforge-sdk";

const baseUrl = (process.env.TRUEFORGE_BASE_URL || "http://localhost:8791").replace(/\/+$/, "");

const client = new TrueForge({
  baseUrl,
  timeoutInSeconds: 60,
});

const { data: agents } = await client.agents.list();

for (const agent of agents) {
  if (agent.name === "agentguard-incident-investigator") {
    console.log(JSON.stringify(agent.manifest.mcpServers ?? [], null, 2));
  }
}
