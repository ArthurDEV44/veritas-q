#!/bin/bash
# Local CI check - Run before pushing to avoid CI failures
# Usage: ./scripts/ci-local.sh

set -e

echo "🔍 Checking formatting..."
cargo fmt --all -- --check

echo "📎 Running clippy..."
cargo clippy --workspace -- -D warnings

echo "🧪 Running tests..."
cargo test --workspace

echo "✅ All checks passed!"
