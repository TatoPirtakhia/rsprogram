// CommonJS startup file for cPanel / Passenger. No TypeScript runtime needed.
"use strict";
process.chdir(__dirname);
import("./dist/server.mjs")
  .then(({ start }) => start())
  .catch((error) => {
    // Never print configuration values, passwords or connection strings.
    console.error(
      "BizMonitor startup failed:",
      error.code || error.name || "Error",
    );
    if (Array.isArray(error.issues))
      console.error(
        "Invalid environment fields:",
        [...new Set(error.issues.map((i) => i.path.join(".")))].join(", "),
      );
    console.error(
      "Check Node 24+, MySQL settings, PUBLIC_ORIGIN and generated keys.",
    );
    process.exit(1);
  });
