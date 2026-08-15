import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertEffectAuditWorkflowContract } from "./check-effect-audit-workflow.mjs";

const workflowPath = new URL("../.github/workflows/effect-audit.yml", import.meta.url);
const workflow = await readFile(workflowPath, "utf8");

assert.doesNotThrow(() => assertEffectAuditWorkflowContract(workflow));

const nativeDependencyCheck = "        run: node scripts/check-native-audit-dependency.mjs";
const workflowContractCheck = "        run: node scripts/check-effect-audit-workflow.mjs";
const workflowContractTest = "        run: node --test scripts/check-effect-audit-workflow.test.mjs";
const requiredStepMutations = [
  ["native dependency contract check", workflow.replace(`\n${nativeDependencyCheck}`, "")],
  ["workflow contract test", workflow.replace(workflowContractTest, "        run: true")],
  ["optional dependency omission", workflow.replace("run: npm ci", "run: npm ci --omit=optional")],
];

for (const [name, invalidWorkflow] of requiredStepMutations) {
  assert.throws(
    () => assertEffectAuditWorkflowContract(invalidWorkflow),
    /Effect-audit workflow contract missing/,
    `${name} mutation must fail`,
  );
}

const invalidWorkflowTestOrder = workflow
  .replace(workflowContractCheck, "        run: __WORKFLOW_CONTRACT_CHECK__")
  .replace(workflowContractTest, workflowContractCheck)
  .replace("        run: __WORKFLOW_CONTRACT_CHECK__", workflowContractTest);
assert.throws(
  () => assertEffectAuditWorkflowContract(invalidWorkflowTestOrder),
  /Effect-audit workflow contract failed/,
  "workflow contract test must run after its positive checker",
);

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
