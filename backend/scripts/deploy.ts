// SHARED (S-3, owner: Vincent). One-command deploy to AWS using only the AWS CLI (no SAM CLI needed:
// CloudFormation runs the SAM transform in the cloud).
//
//   npm run deploy                  backend + frontend
//   npm run deploy -- --backend     only the backend (template + Lambdas)
//   npm run deploy -- --frontend    only the web app (build + upload + CDN refresh)
//   npm run deploy -- --no-website  backend without S3/CloudFront (new accounts until AWS verifies them)
//   npm run deploy -- --learner-lab AWS Academy Learner Lab: us-east-1, uses the lab's LabRole
//                                   (Learner Lab can't create IAM roles). Combine with the flags above.
//
// Needs valid AWS credentials (personal account via `aws login`, or Learner Lab keys). See docs/DEPLOY.md.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const learnerLab = process.argv.includes("--learner-lab");
const REGION = process.env.AWS_REGION ?? (learnerLab ? "us-east-1" : "ap-southeast-2");
const STAGE = "prod";
const STACK = `locdrop-${STAGE}`;
const JWT_PARAM = `/locdrop/${STAGE}/jwt-secret`; // must match template.yaml
const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendDir = path.resolve(backendDir, "..", "frontend");
const buildDir = path.join(backendDir, ".aws-build");

const args = process.argv.slice(2);
const noWebsite = args.includes("--no-website");
const doBackend = !args.includes("--frontend");
const doFrontend = !args.includes("--backend") && !noWebsite;

const step = (msg: string) => console.log(`\n▶ ${msg}`);

// Never fall back to "instance metadata" credentials (169.254.169.254). On a laptop behind a VPN/proxy
// that runs on AWS, that address can reach the VPN server and return ITS credentials instead of failing.
const AWS_ENV = { ...process.env, AWS_EC2_METADATA_DISABLED: "true" };

/** Run the AWS CLI and return stdout. Throws with AWS's error message on failure. */
function aws(cmdArgs: string[], opts: { quiet?: boolean } = {}): string {
  const res = spawnSync("aws", [...cmdArgs, "--region", REGION], {
    env: AWS_ENV,
    encoding: "utf8",
    stdio: opts.quiet ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "inherit"],
    maxBuffer: 50 * 1024 * 1024,
  });
  if (res.error) throw new Error(`Could not run the AWS CLI: ${res.error.message}`);
  if (res.status !== 0) throw new Error((res.stderr ?? "").trim() || `aws ${cmdArgs[0]} ${cmdArgs[1]} failed`);
  return res.stdout;
}

function npm(cmdArgs: string[], env: Record<string, string> = {}) {
  const res = spawnSync("npm", cmdArgs, { stdio: "inherit", shell: true, env: { ...process.env, ...env } });
  if (res.status !== 0) throw new Error(`npm ${cmdArgs.join(" ")} failed`);
}

function stackOutputs(): Record<string, string> {
  const out = JSON.parse(aws(["cloudformation", "describe-stacks", "--stack-name", STACK, "--output", "json"], { quiet: true }));
  const map: Record<string, string> = {};
  for (const o of out.Stacks[0].Outputs ?? []) map[o.OutputKey] = o.OutputValue;
  return map;
}

try {
  // 0. Who am I? (refuse to continue without valid credentials)
  step(`Checking AWS credentials (region ${REGION})`);
  let account: string;
  try {
    const id = JSON.parse(aws(["sts", "get-caller-identity", "--output", "json"], { quiet: true }));
    account = id.Account;
    console.log(`  account ${account} as ${String(id.Arn).replace(/^arn:aws:/, "")}`);
    if (/InstanceRole|:assumed-role\/.*\/i-[0-9a-f]+$/.test(String(id.Arn))) {
      console.error("  ✖ These are a server's built-in credentials, not your sign-in. Run: aws login --profile locdrop");
      process.exit(1);
    }
    if (process.env.EXPECTED_ACCOUNT && process.env.EXPECTED_ACCOUNT !== account) {
      console.error(`  ✖ Expected account ${process.env.EXPECTED_ACCOUNT} but got ${account}. Stopping.`);
      process.exit(1);
    }
  } catch {
    console.error("  ✖ No valid AWS credentials. Sign in first:  aws login   (see docs/DEPLOY.md)");
    process.exit(1);
  }

  if (doBackend) {
    // 1. Login-token secret in SSM Parameter Store (created once, never printed, never in git)
    step(`Ensuring the login-token secret exists in SSM (${JWT_PARAM})`);
    try {
      aws(["ssm", "get-parameter", "--name", JWT_PARAM, "--output", "json"], { quiet: true });
      console.log("  already exists (kept as is, so existing logins stay valid)");
    } catch (err) {
      if (!String(err).includes("ParameterNotFound")) throw err;
      aws(
        ["ssm", "put-parameter", "--name", JWT_PARAM, "--type", "String", "--value", randomBytes(48).toString("base64url"),
          "--description", "LocDrop login-token (JWT) signing secret"],
        { quiet: true },
      );
      console.log("  created a new random secret");
    }

    // 2. Bundle the Lambda code
    step("Bundling Lambda functions");
    npm(["run", "build:lambdas"]);

    // 3. Bucket for deployment packages (created once per account+region)
    const artifacts = `locdrop-deploy-${account}-${REGION}`;
    step(`Ensuring the deployment-package bucket exists (${artifacts})`);
    try {
      aws(["s3api", "head-bucket", "--bucket", artifacts], { quiet: true });
      console.log("  already exists");
    } catch {
      // us-east-1 is S3's default region and rejects an explicit LocationConstraint
      const where = REGION === "us-east-1" ? [] : ["--create-bucket-configuration", `LocationConstraint=${REGION}`];
      aws(["s3api", "create-bucket", "--bucket", artifacts, ...where], { quiet: true });
      aws(["s3api", "put-public-access-block", "--bucket", artifacts, "--public-access-block-configuration",
        "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"], { quiet: true });
      console.log("  created");
    }

    // 4. Upload code + deploy the CloudFormation stack
    step("Uploading Lambda packages");
    mkdirSync(buildDir, { recursive: true });
    let templateFile = path.join(backendDir, "template.yaml");
    if (learnerLab) {
      // Learner Lab can't create IAM roles: give every function the lab's existing LabRole and drop the
      // per-function Policies (SAM would turn them into new roles). template.yaml itself stays unchanged.
      const original = readFileSync(templateFile, "utf8");
      const roleLine = '      Role: !Sub "arn:${AWS::Partition}:iam::${AWS::AccountId}:role/LabRole"';
      const lab = original
        .split(/\r?\n/)
        .filter((line) => !/^ {6}Policies:/.test(line))
        .flatMap((line) => (/^ {6}CodeUri: \.aws-build\//.test(line) ? [line.replace("CodeUri: .aws-build/", "CodeUri: ./"), roleLine] : [line]))
        .join("\n");
      const functions = (original.match(/^ {6}CodeUri: \.aws-build\//gm) ?? []).length;
      const roles = (lab.match(/role\/LabRole/g) ?? []).length;
      if (functions === 0 || roles !== functions || /^ {6}Policies:/m.test(lab)) {
        throw new Error(`Learner Lab template rewrite failed (${functions} functions, ${roles} LabRole lines)`);
      }
      templateFile = path.join(buildDir, "template.learner-lab.yaml"); // lives next to the bundles, so CodeUri: ./<Name>/
      writeFileSync(templateFile, lab);
      console.log(`  Learner Lab: ${roles} functions use LabRole (no new IAM roles)`);
    }
    aws(["cloudformation", "package", "--template-file", templateFile,
      "--s3-bucket", artifacts, "--s3-prefix", STACK, "--output-template-file", path.join(buildDir, "packaged.yaml")], { quiet: true });

    // A failed FIRST deploy leaves an empty stack in ROLLBACK_COMPLETE, which can't be updated: remove it first.
    let status = "";
    try {
      status = aws(["cloudformation", "describe-stacks", "--stack-name", STACK, "--query", "Stacks[0].StackStatus", "--output", "text"], { quiet: true }).trim();
    } catch {
      /* stack doesn't exist yet */
    }
    if (status === "ROLLBACK_COMPLETE") {
      step(`Removing the empty stack left by a failed first deploy (${STACK})`);
      aws(["cloudformation", "delete-stack", "--stack-name", STACK], { quiet: true });
      aws(["cloudformation", "wait", "stack-delete-complete", "--stack-name", STACK], { quiet: true });
      console.log("  removed");
    }

    step(`Deploying stack ${STACK}${noWebsite ? " (backend only, no website)" : ""} (first time takes ~5–10 min)`);
    const deploy = spawnSync("aws", ["cloudformation", "deploy", "--template-file", path.join(buildDir, "packaged.yaml"),
      "--stack-name", STACK, "--capabilities", "CAPABILITY_IAM", "CAPABILITY_AUTO_EXPAND",
      "--parameter-overrides", `Stage=${STAGE}`, `EnableWebsite=${noWebsite ? "false" : "true"}`,
      "--no-fail-on-empty-changeset", "--region", REGION], { stdio: "inherit", env: AWS_ENV });
    if (deploy.status !== 0) {
      console.error(`\n  ✖ Stack deploy failed. See why with:\n    aws cloudformation describe-stack-events --stack-name ${STACK} --region ${REGION} --max-items 15`);
      process.exit(1);
    }
  }

  const outputs = stackOutputs();
  writeFileSync(path.join(buildDir, "outputs.json"), JSON.stringify(outputs, null, 2) + "\n");

  if (doFrontend && !outputs.WebBucketName) {
    console.log("\n  (No website in this stack yet: it was deployed with --no-website. Skipping the web app upload.)");
  } else if (doFrontend) {
    // 5. Build the web app pointing at the cloud API, upload it, refresh the CDN
    step(`Building the web app for ${outputs.ApiUrl}`);
    npm(["run", "build", "--prefix", frontendDir], { VITE_API_URL: outputs.ApiUrl, VITE_USE_MOCKS: "false" });
    const dist = path.join(frontendDir, "dist");
    if (!existsSync(path.join(dist, "index.html"))) throw new Error("frontend build produced no dist/index.html");

    step(`Uploading the web app to s3://${outputs.WebBucketName}`);
    // hashed assets: cache for a year; index.html: always re-check (so new deploys show up immediately)
    aws(["s3", "sync", dist, `s3://${outputs.WebBucketName}`, "--delete", "--exclude", "index.html",
      "--exclude", "mockServiceWorker.js", "--cache-control", "public,max-age=31536000,immutable"], { quiet: true });
    aws(["s3", "cp", path.join(dist, "index.html"), `s3://${outputs.WebBucketName}/index.html`,
      "--cache-control", "no-cache", "--content-type", "text/html; charset=utf-8"], { quiet: true });

    step("Refreshing CloudFront");
    aws(["cloudfront", "create-invalidation", "--distribution-id", outputs.DistributionId, "--paths", "/*", "--output", "json"], { quiet: true });
  }

  console.log(
    `\n✔ Deployed.\n  Web app: ${outputs.WebUrl ?? "(not created yet: redeploy without --no-website once AWS verifies the account)"}` +
      `\n  API:     ${outputs.ApiUrl}\n  (saved to backend/.aws-build/outputs.json)`,
  );
  console.log(`  Check it: npm run smoke:aws`);
} catch (err) {
  console.error(`\n✖ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
