import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertEffectAuditWorkflowContract } from "./check-effect-audit-workflow.mjs";

const workflowPath = new URL("../.github/workflows/effect-audit.yml", import.meta.url);
const workflow = await readFile(workflowPath, "utf8");

assert.doesNotThrow(() => assertEffectAuditWorkflowContract(workflow));

const branch = "      - codex/role-controls-effect-audit";
const invalidTriggers = [
  ["main", workflow.replace(branch, "      - main")],
  ["branch glob", workflow.replace(branch, "      - codex/**")],
  ["extra branch", workflow.replace(branch, `${branch}\n      - main`)],
  ["pull request", workflow.replace("  push:", "  pull_request:\n  push:")],
  ["schedule", workflow.replace("  push:", "  schedule:\n    - cron: \"0 0 * * *\"\n  push:")],
  ["extra event", workflow.replace("  push:", "  issues:\n  push:")],
];

for (const [name, invalidWorkflow] of invalidTriggers) {
  assert.throws(
    () => assertEffectAuditWorkflowContract(invalidWorkflow),
    /Effect-audit workflow trigger contract failed/,
    `${name} trigger mutation must fail`,
  );
}

console.log("Effect-audit workflow trigger mutations rejected.");
