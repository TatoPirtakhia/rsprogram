# Deployment and security

This is an executable demo and integration foundation, not a production-certified release. Run the persistent backend behind a TLS reverse proxy, keep MySQL private, and use managed secret storage. `NODE_ENV=production` rejects the sample JWT secret and the ephemeral demo server. Release mobile builds reject HTTP API URLs. Local development permits HTTP on trusted loopback/LAN addresses.

## Database

Use MySQL 8.4 (8+ required), UTC server timestamps and UTC connections. Financial amounts are `DECIMAL(18,2)` and mysql2 decimal coercion is disabled. Arithmetic uses bigint minor units. All source and reporting times are interpreted in Asia/Tbilisi; timestamps returned to mobile retain offsets.

Identity and financial records use tenant-scoped UUIDs. Receipt/register, transaction/account and reconciliation links have composite tenant foreign keys. Provider external identifiers are unique per tenant/source/table. The data repository reads persisted domain tables; JSON payloads retain the shared source record and optional metadata, while indexed relational columns hold amounts, dates, states and relationships. Integration identifiers currently use stable provider slugs; migrate these to UUIDs before supporting multiple connections per provider.

Use a separate low-privilege runtime database account without DDL permissions. Use a migration account only during releases. Back up encrypted storage and test restores. Provider-account-scoped deduplication keys must be introduced when more than one connection to a single provider is supported.

## Sessions and secrets

- Access token lifetime: 15 minutes. Refresh sessions: 30 days. Refresh secrets are SHA-256 hashes in storage; refresh rotation is atomic and token reuse revokes the session.
- Every protected request validates the persisted session and derives business scope from the signed session. The API does not accept arbitrary tenant headers.
- Argon2id hashes protect passwords. No signup/reset/email verification flow is included; demo users are seeded.
- The encryption utility uses AES-256-GCM, random nonces and caller-supplied tenant/integration context as associated data. A real integration credential lifecycle and KMS key rotation still need implementation.
- Logs redact authorization/cookie headers and never include request bodies. Errors expose stable codes and hide internal exceptions.
- Biometric lock guards app navigation; SecureStore tokens remain the server authentication mechanism. Protected native cache uses SQLCipher and a key stored in SecureStore. Verify cipher support on both actual native builds.

## Synchronization and notification workers

The first version runs one API process with in-process interval jobs and concurrency guards. Fiscal demo refresh defaults to 15 minutes, banking to 30 minutes, push dispatch to 1 minute. They run without the app open. Unsupported live adapters are never scheduled. Real debt polling (6h) and calendar polling (daily) must be configured only after provider verification.

Do not horizontally scale this worker unchanged: implement a distributed lease, durable job claiming, a transactional notification outbox, delivery receipts and device-token cleanup first. Retry currently applies bounded exponential delay; a timeout is applied to push HTTP calls and mobile API calls. Provider-specific timeout/rate limits remain adapter work. Push ticket acceptance is recorded; receipt polling and exactly-once delivery are not guaranteed. Preview imports expire in 15 minutes and are intentionally memory-resident; restarting the server requires a new preview. Confirmed financial data is persistent on MySQL.

## Release checklist

Run automated validation, a MySQL migration/restore exercise, dependency review, security and accessibility review, and physical iOS/Android tests. Configure error monitoring with sanitized payloads. Verify no financial data appears in lock-screen notifications without opt-in. Configure EAS identity, updates runtime version/channels, signing, APNs/FCM and HTTPS. Test account export/deletion and offline cache clearing on device. Verify actual external permissions before switching any source to live.

The current account deletion workflow deletes the one owner/business and dependent records. Multi-owner transfer or shared-business deletion needs a separate policy before multi-user rollout.
