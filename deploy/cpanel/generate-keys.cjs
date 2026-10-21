const { randomBytes } = require("node:crypto");
console.log("CONNECTION_KEY=" + randomBytes(32).toString("hex"));
console.log("CREDENTIAL_ENCRYPTION_KEY=" + randomBytes(32).toString("hex"));
