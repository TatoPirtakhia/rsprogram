#!/bin/bash
# Native regression against Expo's actual SQLCipher source on macOS.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SQLITE_PACKAGE="$(node -p "require.resolve('expo-sqlite/package.json',{paths:['./apps/mobile']})")"
CIPHER_DIR="$(dirname "$SQLITE_PACKAGE")/vendor/sqlcipher"
CHECK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/rsprogram-sqlcipher.XXXXXX")"
trap 'rm -rf "$CHECK_DIR"' EXIT
clang -O0 -DSQLITE_HAS_CODEC -DSQLITE_TEMP_STORE=2 -DSQLCIPHER_CRYPTO_CC \
  -DSQLITE_EXTRA_INIT=sqlcipher_extra_init -DSQLITE_EXTRA_SHUTDOWN=sqlcipher_extra_shutdown \
  -I "$CIPHER_DIR" "$ROOT/apps/mobile/test/native/sqlcipher-connection.c" "$CIPHER_DIR/sqlite3.c" \
  -framework Security -framework CoreFoundation -o "$CHECK_DIR/check"
"$CHECK_DIR/check" "$CHECK_DIR/database.db"
