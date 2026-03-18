import { loadConfig } from "../config.js";
import { createPool, runSchema } from "./pool.js";

async function main() {
  const config = loadConfig();
  const pool = createPool(config);

  try {
    await runSchema(pool);
    console.log("Schema applied successfully.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
