-- Retroactively anonymize PII for already soft-deleted users (GDPR Article 17)
-- This migration ensures that any users deleted before the soft_delete method
-- was updated to include PII anonymization have their personal data removed.

UPDATE users
SET
    email = 'deleted-' || id::text,
    name = NULL,
    avatar_url = NULL
WHERE deleted_at IS NOT NULL
  AND email NOT LIKE 'deleted-%';
