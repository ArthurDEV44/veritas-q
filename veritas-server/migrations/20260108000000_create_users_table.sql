-- Users table for Veritas Q
-- Stores user profiles synchronized from Clerk authentication

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
    -- Primary key: UUID v7 (time-ordered for better index performance)
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Clerk user ID for authentication lookup
    clerk_user_id TEXT UNIQUE NOT NULL,

    -- User profile information (synced from Clerk)
    email TEXT NOT NULL,
    name TEXT,
    avatar_url TEXT,

    -- Trust tier (Tier1 = in-app capture only, Tier2 = verified reporter, Tier3 = hardware attestation)
    tier SMALLINT NOT NULL DEFAULT 1 CHECK (tier BETWEEN 1 AND 3),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Soft delete support for GDPR compliance
    deleted_at TIMESTAMPTZ
);

-- Index for Clerk user lookup (primary authentication path)
CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users(clerk_user_id);

-- Index for email lookup
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Index for active users only (soft delete filter)
CREATE INDEX IF NOT EXISTS idx_users_active ON users(id) WHERE deleted_at IS NULL;

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE users IS 'User profiles synchronized from Clerk authentication';
COMMENT ON COLUMN users.clerk_user_id IS 'Unique identifier from Clerk authentication system';
COMMENT ON COLUMN users.tier IS 'Trust tier: 1=in-app capture, 2=verified reporter, 3=hardware attestation';
COMMENT ON COLUMN users.deleted_at IS 'Soft delete timestamp for GDPR compliance (NULL = active)';
