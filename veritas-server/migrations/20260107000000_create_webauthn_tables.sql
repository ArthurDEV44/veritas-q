-- WebAuthn credentials storage for Veritas Q
-- This table persists device credentials across server restarts

CREATE TABLE IF NOT EXISTS webauthn_credentials (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- WebAuthn credential identifier (base64url encoded)
    credential_id TEXT UNIQUE NOT NULL,

    -- Serialized Passkey data (webauthn-rs Passkey struct as JSON)
    passkey_data JSONB NOT NULL,

    -- User-provided device name
    device_name TEXT,

    -- Device attestation fields
    authenticator_type TEXT NOT NULL DEFAULT 'platform',
    attestation_format TEXT NOT NULL DEFAULT 'none',
    aaguid TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    sign_count INTEGER NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast credential lookup
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_credential_id
    ON webauthn_credentials(credential_id);

-- Index for listing credentials by creation date
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_created_at
    ON webauthn_credentials(created_at DESC);

-- Comment on table
COMMENT ON TABLE webauthn_credentials IS 'Stores WebAuthn/Passkey credentials for device attestation';
COMMENT ON COLUMN webauthn_credentials.credential_id IS 'Base64url-encoded credential ID from WebAuthn';
COMMENT ON COLUMN webauthn_credentials.passkey_data IS 'Serialized webauthn-rs Passkey struct';
COMMENT ON COLUMN webauthn_credentials.sign_count IS 'Authenticator signature counter for replay protection';
