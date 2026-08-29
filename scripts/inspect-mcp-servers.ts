import "dotenv/config";
import { TrueForge } from "@truefoundry/trueforge-sdk";

const baseUrl = (process.env.TRUEFORGE_BASE_URL || "http://localhost:8791").replace(/\/+$/, "");

const client = new TrueForge({
  baseUrl,
  timeoutInSeconds: 60,
});

const { data } = await client.mcpServers.list();

console.log(JSON.stringify(data, null, 2));
