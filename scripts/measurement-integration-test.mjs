import { startLocalTestApp } from "./lib/local-test-app.mjs";
import { runMeasurementChecks } from "./lib/measurement-checks.mjs";

const app = await startLocalTestApp();
try { await runMeasurementChecks(app); }
finally { try { await app.stop(); } finally { await app.pool.end(); } }
