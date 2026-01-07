#!/bin/bash
# Generate a self-signed ECDSA P-256 certificate for C2PA testing
#
# WARNING: These certificates are for DEVELOPMENT ONLY!
# For production, use certificates from a trusted CA that is part of the C2PA trust list.
#
# Usage: ./scripts/generate-test-cert.sh [output_dir]
#
# This will create:
#   - c2pa-test.key: ECDSA P-256 private key
#   - c2pa-test.crt: Self-signed X.509 certificate

set -e

OUTPUT_DIR="${1:-./keys}"

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

KEY_FILE="$OUTPUT_DIR/c2pa-test.key"
CERT_FILE="$OUTPUT_DIR/c2pa-test.crt"
CSR_FILE="$OUTPUT_DIR/c2pa-test.csr"
EXT_FILE="$OUTPUT_DIR/c2pa-ext.cnf"

echo "=== Generating C2PA Test Certificate ==="
echo ""
echo "WARNING: This certificate is for DEVELOPMENT ONLY!"
echo "It will NOT be trusted by C2PA validators in production."
echo ""

# Check if OpenSSL is available
if ! command -v openssl &> /dev/null; then
    echo "Error: OpenSSL is required but not installed."
    exit 1
fi

# Create extensions config file for C2PA compatibility
cat > "$EXT_FILE" << 'EOF'
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = FR
O = Veritas-Q Development
CN = Veritas-Q Test Signer

[v3_req]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,emailProtection
subjectKeyIdentifier = hash

[v3_ca]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,emailProtection
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always
EOF

# Generate ECDSA P-256 private key
echo "1. Generating ECDSA P-256 private key..."
openssl ecparam -name prime256v1 -genkey -noout -out "$KEY_FILE"

# Generate CSR
echo "2. Generating certificate signing request..."
openssl req -new -key "$KEY_FILE" -out "$CSR_FILE" -config "$EXT_FILE"

# Generate self-signed certificate with proper extensions
echo "3. Generating self-signed X.509 certificate with C2PA extensions..."
openssl x509 -req -in "$CSR_FILE" -signkey "$KEY_FILE" -out "$CERT_FILE" \
    -days 365 \
    -extfile "$EXT_FILE" -extensions v3_ca

# Clean up temporary files
rm -f "$CSR_FILE" "$EXT_FILE"

# Verify the certificate
echo "4. Verifying certificate..."
openssl x509 -in "$CERT_FILE" -text -noout | head -30

echo ""
echo "=== Certificate Generated Successfully ==="
echo ""
echo "Files created:"
echo "  Private Key: $KEY_FILE"
echo "  Certificate: $CERT_FILE"
echo ""
echo "To use these certificates, set environment variables:"
echo ""
echo "  export C2PA_SIGNING_KEY=$KEY_FILE"
echo "  export C2PA_SIGNING_CERT=$CERT_FILE"
echo ""
echo "Or add to your .env file:"
echo ""
echo "  C2PA_SIGNING_KEY=$KEY_FILE"
echo "  C2PA_SIGNING_CERT=$CERT_FILE"
echo ""
