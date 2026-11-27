// SHARED (Phase 0a). All settings in one place. Local defaults need no env vars.
// On AWS Lambda (AWS_LAMBDA_FUNCTION_NAME is set automatically) the real DynamoDB endpoint is used.

const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

export const config = {
  isLambda,
  tableName: process.env.TABLE_NAME ?? "LocDrop",
  dynamoEndpoint: process.env.DYNAMO_ENDPOINT ?? (isLambda ? undefined : "http://localhost:8000"),
  region: process.env.AWS_REGION ?? "us-east-1",
  maxActiveNotes: Number(process.env.MAX_ACTIVE_NOTES ?? 5),
  readRadiusM: Number(process.env.READ_RADIUS_M ?? 100),
  geohashPrecision: 7,
  noteMaxChars: 280,
  jwtSecret: process.env.JWT_SECRET ?? (isLambda ? "" : "dev-secret-change-me"),
  jwtTtl: "24h",
  bcryptCost: 10,
  naiveDelayMs: Number(process.env.NAIVE_DELAY_MS ?? 0),
  demoCenter: { lat: 22.69, lng: 114.21 },
  // Live pop-ups: where Lambda posts WebSocket messages (set by template.yaml), and how long a connection
  // item lives without a location update (API Gateway closes WebSockets after 2 h at most).
  wsEndpoint: process.env.WS_ENDPOINT ?? "",
  connectionTtlS: 3 * 60 * 60,
};

if (config.isLambda && !config.jwtSecret) {
  throw new Error("JWT_SECRET must be set when running on AWS Lambda");
}
