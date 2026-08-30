import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = new URL("../", import.meta.url);
const dist = new URL("dist/", root);
const failures = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const files = await walk(dist.pathname);
for (const file of files) {
  const name = relative(dist.pathname, file);
  if (extname(file) === ".map") failures.push(`${name}: source map emitted`);
  if (extname(file) === ".js" || extname(file) === ".css") {
    const content = await readFile(file, "utf8");
    if (/sourceMappingURL\s*=/.test(content)) failures.push(`${name}: sourceMappingURL present`);
    if (/SUPABASE_SERVICE_ROLE|STRIPE_SECRET_KEY|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/.test(content)) {
      failures.push(`${name}: high-risk secret marker present`);
    }
  }
}

// Static regression guard for the public service worker. This complements the
// browser smoke test by failing CI if the authorization/query/private-response
// exclusions or the explicit asset allowlist are removed later.
const serviceWorker = await readFile(new URL("sw.js", dist), "utf8");
const requiredServiceWorkerGuards = [
  'request.headers.has("authorization")',
  'url.pathname.startsWith("/assets/")',
  '!url.search',
  'no-store|private',
];
for (const guard of requiredServiceWorkerGuards) {
  if (!serviceWorker.includes(guard)) failures.push(`sw.js: missing cache-safety guard ${guard}`);
}

if (failures.length) {
  console.error("Production security check failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Production security check passed (${files.length} artifacts, no source maps or high-risk secret markers).`);
}
