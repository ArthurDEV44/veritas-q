#!/bin/bash
# Export C2PA certificates as base64 for cloud deployment
#
# Usage: ./scripts/export-c2pa-certs.sh [keys_dir]
#
# This script reads the C2PA signing key and certificate, encodes them
# as base64, and outputs the environment variables to add to Render.

set -e

KEYS_DIR="${1:-./keys}"

KEY_FILE="$KEYS_DIR/c2pa-test.key"
CERT_FILE="$KEYS_DIR/c2pa-test.crt"

if [ ! -f "$KEY_FILE" ] || [ ! -f "$CERT_FILE" ]; then
    echo "Error: Certificate files not found in $KEYS_DIR"
    echo ""
    echo "Run ./scripts/generate-test-cert.sh first to create them."
    exit 1
fi

echo "=== C2PA Certificate Export for Cloud Deployment ==="
echo ""
echo "Add these environment variables to your Render dashboard:"
echo ""
echo "-----------------------------------------------------------"
echo ""
echo "C2PA_SIGNING_KEY_PEM:"
echo ""
base64 -w 0 "$KEY_FILE"
echo ""
echo ""
echo "-----------------------------------------------------------"
echo ""
echo "C2PA_SIGNING_CERT_PEM:"
echo ""
base64 -w 0 "$CERT_FILE"
echo ""
echo ""
echo "-----------------------------------------------------------"
echo ""
echo "Instructions:"
echo "1. Go to your Render dashboard > Environment"
echo "2. Add C2PA_SIGNING_KEY_PEM with the first base64 value"
echo "3. Add C2PA_SIGNING_CERT_PEM with the second base64 value"
echo "4. Redeploy your service"
echo ""
