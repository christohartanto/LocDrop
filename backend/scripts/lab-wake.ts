// SHARED (A-10). Turns live pop-ups back on after an AWS Academy Learner Lab session has been stopped.
//
// Why: while the lab is stopped, the lab's account-wide policy blocks everything, including the trigger
// that feeds NotifyFn from the table's DynamoDB Stream. Lambda counts that as an unrecoverable error and
// switches the trigger off. Starting the lab again does NOT switch it back on, so pop-ups silently stop.
// This script switches it on again. After that, the trigger first catches up on changes made while it was
// off (usually 1-5 minutes); pop-ups start arriving once it has.
//
// Usage (after Start Lab and fresh keys):  npm run lab:wake -- --learner-lab
// The deploy script runs it automatically at the end.

import { spawnSync } from "node:child_process";

const learnerLab = process.argv.includes("--learner-lab");
const REGION = process.env.AWS_REGION ?? (learnerLab ? "us-east-1" : "ap-southeast-2");
const STACK = "locdrop-prod";
const AWS_ENV = { ...process.env, AWS_EC2_METADATA_DISABLED: "true", MSYS_NO_PATHCONV: "1" };

function aws(args: string[]): string {
  const r = spawnSync("aws", [...args, "--region", REGION, "--output", "text"], { encoding: "utf8", env: AWS_ENV });
  if (r.status !== 0) {
    console.error(`✖ ${r.stderr.trim() || "AWS CLI failed"}\n  (Lab started and fresh keys in ~/.aws/credentials?)`);
    process.exit(1);
  }
  return r.stdout.trim();
}

const notifyFn = aws([
  "cloudformation", "describe-stack-resource", "--stack-name", STACK, "--logical-resource-id", "NotifyFn",
  "--query", "StackResourceDetail.PhysicalResourceId",
]);
const [uuid, state] = aws([
  "lambda", "list-event-source-mappings", "--function-name", notifyFn,
  "--query", "EventSourceMappings[0].[UUID,State]",
]).split(/\s+/);

if (!uuid || uuid === "None") {
  console.error(`✖ ${notifyFn} has no stream trigger. Redeploy: npm run deploy${learnerLab ? " -- --learner-lab" : ""}`);
  process.exit(1);
}

if (state === "Enabled" || state === "Enabling" || state === "Updating") {
  console.log(`✔ Live pop-ups trigger is ${state.toLowerCase()}. Nothing to do.`);
  process.exit(0);
}

console.log(`Live pop-ups trigger is ${state} (usually: the lab was stopped). Switching it back on…`);
aws(["lambda", "update-event-source-mapping", "--uuid", uuid, "--enabled", "--query", "State"]);
for (let i = 0; i < 24; i++) {
  const now = aws(["lambda", "get-event-source-mapping", "--uuid", uuid, "--query", "State"]);
  if (now === "Enabled") {
    console.log("✔ Switched on. Pop-ups start once it has caught up on changes made while it was off (usually 1-5 min).");
    console.log(`  Check: npm run smoke:live -- --aws`);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 5000));
}
console.error("✖ Still not enabled after 2 minutes. Check the Lambda console → NotifyFn → Configuration → Triggers.");
process.exit(1);
