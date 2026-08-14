import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

const [manifest, lockfile, workflow] = await Promise.all([
  readJson("package.json"),
  readJson("package-lock.json"),
  readFile(path.join(root, ".github/workflows/effect-audit.yml"), "utf8"),
]);

assert.equal(
  manifest.optionalDependencies?.gl,
  "8.1.6",
  "gl must be an exact optionalDependency so deploy installs do not fail on its native build",
);
assert.equal(
  manifest.devDependencies?.gl,
  undefined,
  "gl must not remain a devDependency",
);
assert.equal(
  lockfile.packages?.[""]?.optionalDependencies?.gl,
  "8.1.6",
  "package-lock root package must record gl as an exact optionalDependency",
);
assert.equal(
  lockfile.packages?.["node_modules/gl"]?.version,
  "8.1.6",
  "package-lock must retain the audit dependency version",
);
assert.equal(
  lockfile.packages?.["node_modules/gl"]?.optional,
  true,
  "package-lock must mark gl optional so a native install failure is non-fatal",
);
assert.match(workflow, /node-version:\s*["']?22["']?/, "effect audit must stay on Node 22");
assert.match(workflow, /^\s*run:\s*npm ci\s*$/m, "effect audit must retain default npm ci optional-dependency installs");

console.log("Native audit dependency contract verified.");
