import "dotenv/config";
import { getEnv } from "./env.js";

const baseUrl = getEnv("TRUEFORGE_BASE_URL", "http://localhost:8791").replace(/\/$/, "");

async function check(path: string): Promise<void> {
  const response = await fetch(`${baseUrl}${path}`);
  console.log(`${path} -> ${response.status} ${response.statusText}`);
}

console.log(`Checking TrueForge at ${baseUrl}`);

try {
  await check("/healthz");
  await check("/");
} catch (error) {
  console.error("Unable to reach TrueForge.");
  console.error(error);
  process.exitCode = 1;
}
