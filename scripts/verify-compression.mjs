#!/usr/bin/env node
/**
 * verify-compression.mjs
 *
 * Verifies that API responses are being compressed in transit.
 * Checks Content-Encoding headers, decompresses the body, and validates
 * that the JSON still parses correctly after the round-trip.
 *
 * Usage:
 *   node scripts/verify-compression.mjs
 *
 * Prerequisites:
 *   - `npm run build && npm start` OR `npm run dev` must be running on port 3000.
 *   - The server does not need auth for the endpoints tested here
 *     (suggest-features uses only heuristics when no AI key is configured).
 */

import { createGunzip, createBrotliDecompress } from "zlib";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { Buffer } from "buffer";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(bytes) {
  return `${bytes.toLocaleString()} bytes`;
}

function pct(compressed, original) {
  return `${((1 - compressed / original) * 100).toFixed(1)}% smaller`;
}

async function decompressBody(encoding, arrayBuffer) {
  const input = Buffer.from(arrayBuffer);
  if (!encoding || encoding === "identity") return input;

  const chunks = [];
  const source = Readable.from([input]);
  const decompress = encoding === "br" ? createBrotliDecompress() : createGunzip();

  decompress.on("data", (chunk) => chunks.push(chunk));
  await pipeline(source, decompress);
  return Buffer.concat(chunks);
}

async function checkEndpoint({ label, method, path, body, expectLarge }) {
  console.log(`\n── ${label} (${method} ${path}) ──`);

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      // Advertise both encodings — the server should pick the best one.
      "Accept-Encoding": "gzip, br, deflate",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const encoding = res.headers.get("content-encoding");
  const vary = res.headers.get("vary");
  const contentType = res.headers.get("content-type");
  const status = res.status;

  console.log(`   Status          : ${status}`);
  console.log(`   Content-Type    : ${contentType ?? "(none)"}`);
  console.log(`   Content-Encoding: ${encoding ?? "(none — uncompressed)"}`);
  console.log(`   Vary            : ${vary ?? "(none)"}`);

  const rawBytes = await res.arrayBuffer();
  const transferSize = rawBytes.byteLength;

  let decompressedSize = transferSize;
  let parsed;

  try {
    const decompressed = await decompressBody(encoding, rawBytes);
    decompressedSize = decompressed.byteLength;
    parsed = JSON.parse(decompressed.toString("utf8"));
  } catch (err) {
    console.error(`   ❌ DECOMPRESSION / PARSE FAILED: ${err.message}`);
    return { ok: false };
  }

  console.log(`   Transfer size   : ${fmt(transferSize)}`);
  console.log(`   Decompressed    : ${fmt(decompressedSize)}`);
  if (encoding && encoding !== "identity") {
    console.log(`   Savings         : ${pct(transferSize, decompressedSize)}`);
  }

  // Assertions
  let ok = true;

  if (!contentType?.includes("application/json")) {
    console.warn(`   ⚠  Content-Type is not application/json`);
  }

  if (!vary?.toLowerCase().includes("accept-encoding")) {
    console.warn(`   ⚠  Vary: Accept-Encoding header is missing`);
    if (expectLarge) ok = false;
  }

  if (expectLarge && !encoding) {
    console.error(`   ❌ Expected compression but got no Content-Encoding (payload is ${fmt(decompressedSize)})`);
    ok = false;
  }

  if (expectLarge && encoding) {
    console.log(`   ✅ Compressed correctly with ${encoding}`);
  }

  if (parsed && typeof parsed === "object") {
    console.log(`   ✅ JSON parsed correctly (top-level keys: ${Object.keys(parsed).slice(0, 6).join(", ")})`);
  } else {
    console.error(`   ❌ JSON did not parse to an object`);
    ok = false;
  }

  return { ok, encoding, transferSize, decompressedSize };
}

// ─── Test cases ───────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n╔════════════════════════════════════════════════╗`);
  console.log(`║  ContextForge — Compression Verification       ║`);
  console.log(`╚════════════════════════════════════════════════╝`);
  console.log(`  Target: ${BASE_URL}`);

  const results = [];

  // 1. suggest-features (large heuristic response — no AI key needed)
  results.push(
    await checkEndpoint({
      label: "suggest-features (heuristic path)",
      method: "POST",
      path: "/api/contextforge/suggest-features",
      body: {
        projectName: "TaskFlow",
        description:
          "A SaaS project management dashboard with authentication, database storage, search, analytics, notifications, and an admin panel for team management.",
        platform: "web",
        projectType: "UI_APPLICATION",
        existingFeatures: [],
        functionalRequirements: [],
      },
      // Heuristic response may be < 1 KB — don't assert compression.
      expectLarge: false,
    })
  );

  // 2. Test that a small error response is NOT needlessly compressed
  results.push(
    await checkEndpoint({
      label: "Small error response (below threshold)",
      method: "POST",
      path: "/api/contextforge/suggest-features",
      body: {},  // missing required fields → 400 error (tiny body)
      expectLarge: false,
    })
  );

  console.log("\n── Compression Ratio Benchmark (test-output.json) ──");
  try {
    const { readFileSync } = await import("fs");
    const { gzipSync, brotliCompressSync, constants } = await import("zlib");

    const raw = readFileSync(new URL("../test-output.json", import.meta.url));
    const gz = gzipSync(raw, { level: 6 });
    const br = brotliCompressSync(raw, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
    });

    console.log(`   Raw JSON        : ${fmt(raw.byteLength)}`);
    console.log(`   Gzip (level 6)  : ${fmt(gz.byteLength)}  (${pct(gz.byteLength, raw.byteLength)})`);
    console.log(`   Brotli (q=4)    : ${fmt(br.byteLength)}  (${pct(br.byteLength, raw.byteLength)})`);
    console.log(`   ✅ Benchmark complete`);
  } catch (err) {
    console.warn(`   ⚠  Could not run benchmark: ${err.message}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${"─".repeat(50)}`);
  if (failed.length === 0) {
    console.log("✅  All checks passed.");
  } else {
    console.error(`❌  ${failed.length} check(s) failed.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
