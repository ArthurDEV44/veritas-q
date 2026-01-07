-- Manifest Repository for Soft Binding Resolution
-- Stores seal metadata and perceptual hashes for similarity search

CREATE TABLE IF NOT EXISTS manifests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seal_id VARCHAR(36) NOT NULL,
    perceptual_hash BYTEA,                  -- 8 bytes (64 bits), NULL for non-image content
    image_hash VARCHAR(64) NOT NULL,        -- SHA3-256 hex (crypto hash)
    seal_cbor BYTEA NOT NULL,               -- Full VeritasSeal CBOR serialized
    media_type VARCHAR(32) NOT NULL,        -- image/video/audio/generic
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique constraint on seal_id
    CONSTRAINT manifests_seal_id_unique UNIQUE (seal_id)
);

-- Index for lookup by seal_id (primary use case)
CREATE INDEX IF NOT EXISTS idx_manifests_seal_id
ON manifests (seal_id);

-- Index for lookup by image_hash (exact content match)
CREATE INDEX IF NOT EXISTS idx_manifests_image_hash
ON manifests (image_hash);

-- Index for perceptual hash similarity search
-- btree works for exact match; for true similarity search, we compute hamming in app layer
CREATE INDEX IF NOT EXISTS idx_manifests_phash
ON manifests (perceptual_hash)
WHERE perceptual_hash IS NOT NULL;

-- Index for sorting by creation date (recent first)
CREATE INDEX IF NOT EXISTS idx_manifests_created_at
ON manifests (created_at DESC);

-- Comment on table
COMMENT ON TABLE manifests IS 'Stores Veritas seal metadata for soft binding resolution via perceptual hash similarity';
COMMENT ON COLUMN manifests.perceptual_hash IS '64-bit perceptual hash (pHash) for image similarity search, NULL for non-image content';
COMMENT ON COLUMN manifests.image_hash IS 'SHA3-256 cryptographic hash of original content (hex-encoded)';
COMMENT ON COLUMN manifests.seal_cbor IS 'Complete VeritasSeal serialized in CBOR format';
