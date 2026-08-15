#!/usr/bin/env node
/**
 * Regenerates public/demo-reel.json — the pool of Aesthetic Rebellion product
 * frames the home-screen film reel scrolls through.
 *
 * Snapshot, not a live feed: the reel loads a static JSON so the landing page
 * ships no API credentials and pays no request latency. Re-run this whenever
 * the catalogue changes enough to matter.
 *
 *   node tools/build-demo-reel.mjs
 *
 * Requires the Shopify CLI to be authenticated against the store already
 * (`shopify store auth`). Product images live on cdn.shopify.com, which serves
 * `access-control-allow-origin: *`, so the reel can fetch a frame straight into
 * the mosh engine without a proxy.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STORE = "sqpch3-kt.myshopify.com";
const OUT = new URL("../public/demo-reel.json", import.meta.url).pathname;

const QUERY = `
query Frames($after: String) {
  products(first: 250, after: $after, query: "status:active") {
    pageInfo { hasNextPage endCursor }
    nodes {
      title
      handle
      onlineStoreUrl
      featuredMedia { preview { image { url width height } } }
    }
  }
}`;

const work = mkdtempSync(join(tmpdir(), "demo-reel-"));
const queryFile = join(work, "query.graphql");
writeFileSync(queryFile, QUERY);

const nodes = [];
let after = null;

// 250 is the Admin API page ceiling; the guard stops a cursor bug from looping
// forever rather than expressing a real catalogue limit.
for (let page = 0; page < 40; page++) {
  const varsFile = join(work, "vars.json");
  const outFile = join(work, `page-${page}.json`);
  writeFileSync(varsFile, JSON.stringify({ after }));

  execFileSync("shopify", [
    "store", "execute",
    "-s", STORE,
    "--query-file", queryFile,
    "--variable-file", varsFile,
    "-j",
    "--output-file", outFile,
  ], { stdio: ["ignore", "ignore", "inherit"] });

  const { products } = JSON.parse(readFileSync(outFile, "utf8"));
  nodes.push(...products.nodes);
  process.stderr.write(`page ${page}: ${nodes.length} products\n`);

  if (!products.pageInfo.hasNextPage) break;
  after = products.pageInfo.endCursor;
}

/**
 * Product titles are written for search, not for a 90px caption — they run to
 * 200 characters of keyword tail. Cut at the first em dash or comma, which is
 * where the human-readable half of an Aesthetic Rebellion title ends.
 */
function shortLabel(title) {
  const head = title.split(/\s+—\s+|,/)[0].trim();
  return head.length > 42 ? `${head.slice(0, 41).trimEnd()}…` : head;
}

const frames = nodes
  .filter((n) => n.featuredMedia?.preview?.image?.url && n.onlineStoreUrl)
  .map((n) => ({
    label: shortLabel(n.title),
    src: n.featuredMedia.preview.image.url,
    productUrl: n.onlineStoreUrl,
  }));

if (frames.length === 0) throw new Error("no frames resolved — check store auth");

writeFileSync(OUT, `${JSON.stringify(frames)}\n`);
process.stderr.write(`wrote ${frames.length} frames -> ${OUT}\n`);
