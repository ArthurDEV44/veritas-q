-- Seals table for Veritas Q
-- Stores seal records linked to authenticated users (Story 2.1)

CREATE TABLE IF NOT EXISTS seals (
    -- Primary key: UUID v7 (time-ordered for better index performance)
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User who created the seal (nullable for anonymous seals from public API)
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Organization context (nullable for personal seals)
    organization_id UUID,

    -- Content hashes for verification
    content_hash TEXT NOT NULL,           -- SHA3-256 hex-encoded (64 chars)
    perceptual_hash BYTEA,                -- DCT-based perceptual hash for images (8 bytes)

    -- QRNG entropy and source information
    qrng_entropy BYTEA NOT NULL,          -- 32 bytes of quantum entropy
    qrng_source TEXT NOT NULL,            -- Source: "lfd", "anu", "mock", "hardware"

    -- ML-DSA-65 signature and public key
    signature BYTEA NOT NULL,             -- Post-quantum signature
    public_key BYTEA NOT NULL,            -- Public key for verification

    -- Media metadata
    media_type TEXT NOT NULL DEFAULT 'image',  -- "image", "video", "audio"
    file_size INTEGER,                         -- Original file size in bytes
    mime_type TEXT,                            -- Content-Type of original file

    -- Capture context (JSON for flexibility)
    metadata JSONB NOT NULL DEFAULT '{}',
    -- Expected metadata structure:
    -- {
    --   "timestamp": "2026-01-08T10:00:00Z",
    --   "location": { "lat": 48.8566, "lng": 2.3522, "altitude": 35 },
    --   "device": { "user_agent": "...", "platform": "..." },
    --   "capture_source": "camera" | "gallery",
    --   "has_device_attestation": true
    -- }

    -- Trust tier at time of sealing (copied from user for historical accuracy)
    trust_tier SMALLINT NOT NULL DEFAULT 1 CHECK (trust_tier BETWEEN 1 AND 3),

    -- C2PA integration
    c2pa_manifest_embedded BOOLEAN NOT NULL DEFAULT false,

    -- Timestamps
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- When the media was captured
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- When the seal was created

    -- GDPR support: media can be deleted while preserving cryptographic proof
    media_deleted_at TIMESTAMPTZ
);

-- Index for user's seals (primary query path for dashboard)
CREATE INDEX IF NOT EXISTS idx_seals_user_id ON seals(user_id) WHERE user_id IS NOT NULL;

-- Index for organization's seals (B2B multi-tenancy)
CREATE INDEX IF NOT EXISTS idx_seals_organization_id ON seals(organization_id) WHERE organization_id IS NOT NULL;

-- Index for perceptual hash similarity searches
CREATE INDEX IF NOT EXISTS idx_seals_perceptual_hash ON seals USING btree(perceptual_hash) WHERE perceptual_hash IS NOT NULL;

-- Index for content hash exact lookups
CREATE INDEX IF NOT EXISTS idx_seals_content_hash ON seals(content_hash);

-- Index for time-based queries (recent seals, usage analytics)
CREATE INDEX IF NOT EXISTS idx_seals_created_at ON seals(created_at DESC);

-- Index for user's recent seals (dashboard pagination)
CREATE INDEX IF NOT EXISTS idx_seals_user_created ON seals(user_id, created_at DESC) WHERE user_id IS NOT NULL;

-- Partial index for seals with active media (not deleted)
CREATE INDEX IF NOT EXISTS idx_seals_active_media ON seals(id) WHERE media_deleted_at IS NULL;

-- Comments for documentation
COMMENT ON TABLE seals IS 'Quantum-authenticated media seals linked to users';
COMMENT ON COLUMN seals.user_id IS 'User who created the seal (NULL for anonymous/API seals)';
COMMENT ON COLUMN seals.organization_id IS 'Organization context for B2B multi-tenancy';
COMMENT ON COLUMN seals.content_hash IS 'SHA3-256 cryptographic hash of original content';
COMMENT ON COLUMN seals.perceptual_hash IS 'DCT-based perceptual hash for soft binding (images only)';
COMMENT ON COLUMN seals.qrng_entropy IS '256 bits of quantum entropy bound to this seal';
COMMENT ON COLUMN seals.qrng_source IS 'Source of QRNG entropy: lfd, anu, mock, hardware';
COMMENT ON COLUMN seals.trust_tier IS 'Trust tier at sealing: 1=in-app, 2=verified reporter, 3=hardware';
COMMENT ON COLUMN seals.metadata IS 'JSON capture context: timestamp, location, device info';
COMMENT ON COLUMN seals.media_deleted_at IS 'When media was deleted (GDPR), hash preserved for verification';
