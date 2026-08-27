import "dotenv/config";
import { TrueForge } from "@truefoundry/trueforge-sdk";
import { getEnv, requireEnv } from "../src/trueforge/env.js";

const baseUrl = getEnv(
  "TRUEFORGE_BASE_URL",
  "http://localhost:8791"
).replace(/\/+$/, "");

const apiKey = requireEnv("DAYTONA_API_KEY");

const client = new TrueForge({
  baseUrl,
  timeoutInSeconds: 60,
});

console.log(`Configuring Daytona sandbox provider at ${baseUrl}...`);

try {
  const { data } = await client.settings.sandboxProviders.createOrUpdate({
    manifest: {
      type: "daytona",
      auth: {
        apiKey,
      },
      autoStopIntervalInMinutes: 15,
      autoArchiveIntervalInMinutes: 60,
      autoDeleteIntervalInMinutes: 10080,
      execTimeoutMs: 120000,
    },
  });

  console.log("TrueForge Daytona sandbox provider configured.");
  console.log(`Provider type: ${data.manifest.type}`);
  console.log("API key: stored by TrueForge; not printed.");
} catch (error) {
  console.error("Failed to configure TrueForge Daytona sandbox provider.");
  console.error(error);
  process.exitCode = 1;
}
