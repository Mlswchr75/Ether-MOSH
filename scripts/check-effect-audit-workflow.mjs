import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const expectedBranch = "codex/role-controls-effect-audit";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isRecord(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function assertTriggerContract(document) {
  const triggers = document?.on;
  const expectedEvents = ["workflow_dispatch", "push"];
  if (!hasExactKeys(triggers, expectedEvents)) {
    throw new Error(`Effect-audit workflow trigger contract failed: expected only ${expectedEvents.join(" and ")}.`);
  }
  if (triggers.workflow_dispatch !== null && !isRecord(triggers.workflow_dispatch)) {
    throw new Error("Effect-audit workflow trigger contract failed: workflow_dispatch must not have a scalar configuration.");
  }
  if (!hasExactKeys(triggers.push, ["branches"]) || !Array.isArray(triggers.push.branches)
    || triggers.push.branches.length !== 1 || triggers.push.branches[0] !== expectedBranch) {
    throw new Error(`Effect-audit workflow trigger contract failed: push must target only ${expectedBranch}.`);
  }
}

const required = [
  ["Ubuntu runner", /runs-on:\s*ubuntu-latest/],
  ["Node 22 setup", /node-version:\s*["']?22["']?/],
  ["default optional-dependency lockfile install", /^\s*run:\s*npm ci\s*$/m],
  ["native audit dependency contract", /^\s*run:\s*node scripts\/check-native-audit-dependency\.mjs\s*$/m],
  ["Xvfb installation", /apt-get install[^\n]*\bxvfb\b/],
  ["Xvfb authentication helper", /apt-get install[^\n]*\bxauth\b/],
  ["readiness-safe Xvfb execution", /xvfb-run\s+-a/],
  ["Xvfb error log", /-e\s+logs\/effect-audit\/xvfb\.log/],
  ["unchanged complete audit command", /npm run audit:effects -- --out-dir docs\/effect-audit/],
  ["pipefail audit failure propagation", /set -o pipefail/],
  ["always-run artifact upload", /if:\s*\$\{\{ always\(\) \}\}/],
  ["artifact upload action", /uses:\s*actions\/upload-artifact@v4/],
  ["dated JSON evidence", /docs\/effect-audit\/2026-08-14-results\.json/],
  ["dated contact sheet evidence", /docs\/effect-audit\/2026-08-14-contact-sheet\.png/],
  ["diagnostic frame evidence", /docs\/effect-audit\/frames\/\*\*/],
  ["audit log evidence", /logs\/effect-audit\/\*\*/],
];

export function assertEffectAuditWorkflowContract(workflow) {
  const document = yaml.load(workflow);
  assertTriggerContract(document);

  const missing = required.filter(([, pattern]) => !pattern.test(workflow)).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Effect-audit workflow contract missing: ${missing.join(", ")}`);
  }

  const installStep = workflow.indexOf("run: npm ci");
  const nativeDependencyCheck = workflow.indexOf("run: node scripts/check-native-audit-dependency.mjs");
  if (nativeDependencyCheck <= installStep) {
    throw new Error("Effect-audit workflow contract failed: native dependency check must run after npm ci.");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const workflowPath = new URL("../.github/workflows/effect-audit.yml", import.meta.url);
  const workflow = await readFile(workflowPath, "utf8");
  assertEffectAuditWorkflowContract(workflow);
  console.log("Effect-audit workflow contract verified.");
}
