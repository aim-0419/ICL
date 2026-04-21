import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { ensureInitialized } from "./shared/db/mysql.js";

const app = createApp();

ensureInitialized()
  .then(() => {
    app.listen(env.port, () => {
      console.log(`[backend] API server running at http://localhost:${env.port}`);
    });
  })
  .catch((error) => {
    console.error("[backend] DB initialization failed, aborting startup", error);
    process.exit(1);
  });
