import { readFile, writeFile } from "node:fs/promises";

const CONFIG_PATH = new URL("../wrangler.jsonc", import.meta.url);
const PLACEHOLDER_DATABASE_ID = "00000000-0000-0000-0000-000000000000";

const isWorkersBuild = process.env.WORKERS_CI === "1";
const workersBuildBranch = process.env.WORKERS_CI_BRANCH?.trim();

if (!isWorkersBuild || workersBuildBranch !== "main") {
  console.log(
    isWorkersBuild
      ? `Skipping production D1 hydration for Cloudflare preview branch ${workersBuildBranch || "(unknown)"}.`
      : "Skipping production D1 hydration outside a Cloudflare Workers Build on main.",
  );
  process.exit(0);
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();

if (!accountId || !apiToken) {
  throw new Error("Cloudflare deployment credentials are required to resolve the production D1 binding.");
}

const config = await readFile(CONFIG_PATH, "utf8");
const workerNameMatch = config.match(/"name"\s*:\s*"([^"]+)"/);
const bindingMatch = config.match(/"binding"\s*:\s*"([^"]+)"\s*,\s*\n\s*"database_name"/);

if (!workerNameMatch?.[1]) {
  throw new Error("wrangler.jsonc does not declare a Worker name.");
}

if (!bindingMatch?.[1]) {
  throw new Error("wrangler.jsonc does not declare a D1 binding name.");
}

if (!config.includes(`"database_id": "${PLACEHOLDER_DATABASE_ID}"`)) {
  throw new Error("wrangler.jsonc must contain the non-production D1 placeholder before deployment hydration.");
}

const workerName = workerNameMatch[1];
const bindingName = bindingMatch[1];
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(workerName)}/settings`;

let payload;
try {
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  payload = await response.json();
} catch {
  throw new Error(
    "Cloudflare could not return the currently deployed Worker bindings. Verify the deployment token has Workers Scripts access and the configured account is correct.",
  );
}

const bindings = payload?.result?.bindings;
if (!payload?.success || !Array.isArray(bindings)) {
  throw new Error("Cloudflare Worker settings returned an unexpected response.");
}

const matches = bindings.filter(
  (binding) =>
    binding?.type === "d1"
    && binding?.name === bindingName
    && typeof (binding?.database_id ?? binding?.id) === "string",
);

if (matches.length !== 1) {
  throw new Error(`Expected exactly one deployed D1 binding named ${bindingName}; found ${matches.length}.`);
}

const databaseId = matches[0].database_id ?? matches[0].id;
const hydrated = config.replace(
  `"database_id": "${PLACEHOLDER_DATABASE_ID}"`,
  `"database_id": "${databaseId}"`,
);

if (hydrated === config) {
  throw new Error("Production D1 binding could not be hydrated.");
}

// Email Service requires an explicit allowed_sender_addresses binding for
// arbitrary recipients, even on Workers Paid. Build-time sender addresses are
// intentionally provided outside Git and injected only into the deployed Worker.
const additional = (process.env.CLOUDFLARE_NATIVE_SENDERS ?? "")
  .split(/[;,\s]+/).map((value) => value.trim().toLowerCase()).filter(Boolean);
if (additional.length > 100 || additional.some((email) =>
  !/^[^@\s,;]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(email) || email.length > 320)) {
  throw new Error("CLOUDFLARE_NATIVE_SENDERS must contain at most 100 valid email addresses.");
}
const parsed = JSON.parse(hydrated);
const multi = parsed.send_email?.find((binding) => binding.name === "EMAIL_MULTI");
if (!multi || !parsed.vars?.PRIMARY_ADDRESS) {
  throw new Error("Expected multi-sender binding and primary address in Wrangler configuration.");
}
const primary = parsed.vars.PRIMARY_ADDRESS.toLowerCase();
const senders = [...new Set(additional.filter((email) => email !== primary))];
multi.allowed_sender_addresses = [primary, ...senders];
parsed.vars.CUSTOM_SENDER_ALLOWLIST = senders.join(",");

await writeFile(CONFIG_PATH, JSON.stringify(parsed, null, 2) + "\n", "utf8");
console.log("Resolved production D1 binding and configured explicit outbound sender allowlist (" + senders.length + " additional addresses).");
