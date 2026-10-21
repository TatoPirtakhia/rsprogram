#!/bin/bash
set -euo pipefail
exec bash "$(cd "$(dirname "$0")" && pwd)/iPhone-install-built.command"
