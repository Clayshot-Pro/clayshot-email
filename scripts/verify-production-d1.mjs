import { readFile } from "node:fs/promises";

const PLACEHOLDER_DATABASE_ID = "00000000-0000-0000-0000-000000000000";
const source = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
if (typeof source.name !== "string" || !/^[a-z0-9][a-z0-9_-]*$/.test(source.name)) {
  throw new Error("Invalid Worker name in wrangler.jsonc.");
}
const outputName = source.name.replace(/-/g, "_");
const built = JSON.parse(await readFile(new URL(`../dist/${outputName}/wrangler.json`, import.meta.url), "utf8"));
const resolved = built.d1_databases?.find((entry) => entry.binding === "DB");
if (built.name !== source.name || !resolved?.database_id || resolved.database_id === PLACEHOLDER_DATABASE_ID) {
  throw new Error("Generated Wrangler config has the wrong Worker or an unresolved D1 database binding.");
}
console.log("Generated Wrangler config has the correct Worker name and resolved production D1 binding.");
