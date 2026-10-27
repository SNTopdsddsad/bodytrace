import { startLocalTestApp } from "./lib/local-test-app.mjs";
import { runTrainingChecks } from "./lib/training-checks.mjs";

const app = await startLocalTestApp();
try {
  await runTrainingChecks(app);
} finally {
  try { await app.stop(); } finally { await app.pool.end(); }
}
