// SHARED (S-3). Bundles every deployed handler into .aws-build/<Name>/index.js (one self-contained
// CommonJS file per Lambda, all npm packages included) and checks template.yaml / routes.ts agree.
// Usage: npm run build:lambdas

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { routes } from "../src/local/routes";
import { isHttp, lambdas } from "./lambdas";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.join(backendDir, ".aws-build");

// 1. Consistency checks, so a new endpoint can't be forgotten in AWS.
const template = readFileSync(path.join(backendDir, "template.yaml"), "utf8");
const problems: string[] = [];
for (const r of routes.filter((r) => !r.devOnly)) {
  if (!lambdas.filter(isHttp).some((l) => l.method === r.method && l.path === r.path)) problems.push(`route ${r.method} ${r.path} has no Lambda in scripts/lambdas.ts`);
}
for (const l of lambdas) {
  if (!new RegExp(`^  ${l.name}:`, "m").test(template)) problems.push(`${l.name} missing from template.yaml`);
  if (!template.includes(`CodeUri: .aws-build/${l.name}/`)) problems.push(`${l.name}: template.yaml must use CodeUri: .aws-build/${l.name}/`);
  if (isHttp(l) && !template.includes(`Path: ${l.path}\n`) && !template.includes(`Path: ${l.path}\r\n`)) problems.push(`${l.name}: path ${l.path} not found in template.yaml`);
  if (!isHttp(l) && l.route && !template.includes(`RouteKey: ${l.route}`)) problems.push(`${l.name}: WebSocket route ${l.route} not found in template.yaml`);
}
if (problems.length) {
  console.error("template.yaml / routes / lambdas.ts disagree:\n  - " + problems.join("\n  - "));
  process.exit(1);
}

// 2. Bundle.
rmSync(outRoot, { recursive: true, force: true });
const started = performance.now();
await Promise.all(
  lambdas.map((l) =>
    build({
      entryPoints: [path.join(backendDir, l.entry)],
      outfile: path.join(outRoot, l.name, "index.js"),
      bundle: true,
      platform: "node",
      target: "node22",
      format: "cjs",
      minify: true,
      sourcemap: false,
      legalComments: "none",
      logLevel: "warning",
    }).then(() =>
      // backend/package.json says "type": "module"; this marks each bundle as CommonJS explicitly,
      // so it loads the same way locally and on Lambda.
      writeFileSync(path.join(outRoot, l.name, "package.json"), JSON.stringify({ type: "commonjs" }) + "\n"),
    ),
  ),
);
console.log(`Bundled ${lambdas.length} Lambda functions into .aws-build/ in ${((performance.now() - started) / 1000).toFixed(1)} s`);
