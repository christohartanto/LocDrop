// SHARED (S-3). Runs the smoke test against the deployed API.
// Reads the API URL from the CloudFormation stack and the login-token secret from SSM, so the
// smoke test's "with token" requests are accepted by the cloud. The secret is never printed.
// Usage: npm run smoke:aws

import { spawnSync } from "node:child_process";

const REGION = process.env.AWS_REGION ?? "ap-southeast-2";
const STACK = "locdrop-prod";

function aws(args: string[]): string {
  // AWS_EC2_METADATA_DISABLED: never pick up a VPN/proxy server's instance credentials (see deploy.ts)
  const r = spawnSync("aws", [...args, "--region", REGION, "--output", "text"], {
    encoding: "utf8",
    env: { ...process.env, AWS_EC2_METADATA_DISABLED: "true" },
  });
  if (r.status !== 0) {
    console.error(`✖ ${r.stderr.trim() || "AWS CLI failed"}\n  (Signed in? Run: aws login)`);
    process.exit(1);
  }
  return r.stdout.trim();
}

const apiUrl = aws(["cloudformation", "describe-stacks", "--stack-name", STACK, "--query", "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue"]);
const secret = aws(["ssm", "get-parameter", "--name", "/locdrop/prod/jwt-secret", "--query", "Parameter.Value"]);

const res = spawnSync("npx", ["tsx", "scripts/smoke.ts"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, API_URL: apiUrl, JWT_SECRET: secret },
});
process.exit(res.status ?? 1);
