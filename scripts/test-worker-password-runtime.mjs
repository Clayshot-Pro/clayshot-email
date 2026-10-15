import assert from "node:assert/strict";

const origin = "http://127.0.0.1:8789";
let lastError = "";
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    const response = await fetch(origin, { signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.ok, true, JSON.stringify(result));
    console.log("PASS: scrypt password creation and verification inside Cloudflare workerd");
    process.exit(0);
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}
throw new Error("Cloudflare workerd password test failed: " + lastError);
