# Deploying LocDrop to AWS (S-3)

One command deploys everything to a **personal AWS account** in **Singapore (ap-southeast-1)**. Do **not** use AWS Academy Learner Lab: it can't create the permission roles Lambda needs, its keys expire every few hours, and it is wiped when the course ends.

## What gets created

| Piece | AWS service | Notes |
|---|---|---|
| Database | DynamoDB table `locdrop-prod` | Same keys and indexes as DynamoDB Local; on-demand billing |
| 11 endpoints | Lambda (Node.js 22, arm64) | One function per endpoint, bundled from the same handler code we run locally |
| API | API Gateway HTTP API | Rate-limited (50 req/s, bursts of 100) to cap costs |
| Web app | S3 (private) + CloudFront | HTTPS link that works on any phone, so real GPS works |
| Login secret | SSM Parameter Store `/locdrop/prod/jwt-secret` | Random, created once by the deploy script, never in git |

Everything is defined in [`backend/template.yaml`](../backend/template.yaml). At our usage this should cost about $0/month.

## First time (one person, ~15 min)

1. **Create a personal AWS account** at https://aws.amazon.com/free.
2. **Set a budget alert:** AWS console → *Budgets* → *Create budget* → *Zero spend budget* (or $5/month) → your email.
3. **Sign the laptop in** (opens the browser):
   ```powershell
   aws login
   ```
   When asked for a region, use `ap-southeast-1`. Check it worked: `aws sts get-caller-identity` shows your account number.
4. **Deploy:**
   ```powershell
   npm install --prefix backend
   npm install --prefix frontend
   npm run deploy
   ```
   The first deploy takes ~5–10 minutes (mostly CloudFront). At the end it prints the **Web app** link.
5. **Check it:**
   ```powershell
   npm run smoke:aws
   ```
   Every line should say PASS. Then open the Web app link on your phone.

## Later deploys

```powershell
npm run deploy                 # everything
npm run deploy -- --backend    # only API/Lambda changes
npm run deploy -- --frontend   # only web app changes
```

Merge to `main` first, then deploy from `main`, so the cloud always matches `main`.

## Useful commands

| Task | Command |
|---|---|
| Show the links again | `type backend\.aws-build\outputs.json` |
| Recent errors from one endpoint | `aws logs tail /aws/lambda/<function name> --since 15m --region ap-southeast-1` (find names in the Lambda console) |
| Why a deploy failed | `aws cloudformation describe-stack-events --stack-name locdrop-prod --region ap-southeast-1 --max-items 15` |
| Delete everything (stops all costs) | `aws cloudformation delete-stack --stack-name locdrop-prod --region ap-southeast-1`, then empty and delete the `locdrop-deploy-...` bucket |

## Good to know

- **Same code as local.** The handlers don't change. `src/shared/config.ts` notices it's running on Lambda and talks to the real DynamoDB table instead of DynamoDB Local.
- **Not deployed:** the local Express server and the dev-only naive route used by the A-8 benchmark. The 📍 Dev location panel is also hidden in the deployed app; it uses real GPS.
- **New AWS accounts** sometimes have low limits (e.g. 10 Lambda functions running at the same time, or CloudFront needing account verification). If a deploy or a load test fails with a limit error, ask AWS Support for an increase.
- **Who can deploy:** whoever owns the AWS account. Teammates don't need AWS access to use the app, just the link.
