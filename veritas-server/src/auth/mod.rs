//! JWT authentication module
//!
//! Provides `AuthenticatedUser` and `JwtClaims` extractors for Axum handlers.
//! JWT tokens are validated against Clerk's JWKS endpoint with a 1-hour cache TTL.

use std::time::{Duration, Instant};

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use jsonwebtoken::{decode, decode_header, jwk, Algorithm, DecodingKey, Validation};
use serde::Deserialize;
use tokio::sync::RwLock;

use crate::db::User;
use crate::error::ApiError;
use crate::handlers::AppState;

/// JWKS cache TTL (1 hour)
const JWKS_CACHE_TTL: Duration = Duration::from_secs(3600);

/// JWT claims from Clerk tokens
#[derive(Debug, Deserialize)]
struct ClerkClaims {
    /// Subject (Clerk user ID)
    sub: String,
    /// Expiration time (validated by jsonwebtoken)
    #[allow(dead_code)]
    exp: u64,
}

/// Cached JWKS keys with timestamp
struct CachedJwks {
    keys: Vec<jwk::Jwk>,
    fetched_at: Instant,
}

/// JWKS cache that fetches and caches Clerk's JSON Web Key Set
pub struct JwksCache {
    keys: RwLock<Option<CachedJwks>>,
    jwks_url: String,
    http_client: reqwest::Client,
}

/// JWKS response structure from Clerk
#[derive(Deserialize)]
struct JwksResponse {
    keys: Vec<jwk::Jwk>,
}

impl JwksCache {
    /// Create a new JWKS cache for the given Clerk JWKS URL
    pub fn new(jwks_url: String) -> Self {
        Self {
            keys: RwLock::new(None),
            jwks_url,
            http_client: reqwest::Client::new(),
        }
    }

    /// Get cached JWKS keys, fetching from Clerk if expired or not yet cached
    async fn get_keys(&self) -> Result<Vec<jwk::Jwk>, ApiError> {
        // Try read lock first (fast path)
        {
            let cache = self.keys.read().await;
            if let Some(ref cached) = *cache {
                if cached.fetched_at.elapsed() < JWKS_CACHE_TTL {
                    return Ok(cached.keys.clone());
                }
            }
        }

        // Cache miss or expired — acquire write lock and fetch
        let mut cache = self.keys.write().await;

        // Double-check after acquiring write lock (another task may have refreshed)
        if let Some(ref cached) = *cache {
            if cached.fetched_at.elapsed() < JWKS_CACHE_TTL {
                return Ok(cached.keys.clone());
            }
        }

        let response = self
            .http_client
            .get(&self.jwks_url)
            .send()
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "Failed to fetch JWKS from Clerk");
                ApiError::internal("Authentication service temporarily unavailable")
            })?;

        if !response.status().is_success() {
            let status = response.status();
            tracing::error!(status = %status, "Clerk JWKS endpoint returned error");
            return Err(ApiError::internal(
                "Authentication service temporarily unavailable",
            ));
        }

        let jwks: JwksResponse = response.json().await.map_err(|e| {
            tracing::error!(error = %e, "Failed to parse JWKS response");
            ApiError::internal("Authentication service temporarily unavailable")
        })?;

        let keys = jwks.keys;
        tracing::info!(key_count = keys.len(), "Refreshed JWKS cache from Clerk");

        *cache = Some(CachedJwks {
            keys: keys.clone(),
            fetched_at: Instant::now(),
        });

        Ok(keys)
    }

    /// Find a JWK by key ID
    async fn find_key(&self, kid: &str) -> Result<jwk::Jwk, ApiError> {
        let keys = self.get_keys().await?;
        keys.into_iter()
            .find(|k| k.common.key_id.as_deref() == Some(kid))
            .ok_or_else(|| {
                ApiError::auth_error(
                    "AUTH_UNKNOWN_KEY",
                    format!("No matching key found for kid '{}'", kid),
                )
            })
    }
}

/// Validate a JWT token and extract Clerk claims.
///
/// This is the core validation logic, separated for testability.
async fn validate_jwt(token: &str, jwks_cache: &JwksCache) -> Result<ClerkClaims, ApiError> {
    // Decode header to get kid
    let header = decode_header(token).map_err(|e| {
        ApiError::auth_error("AUTH_INVALID_TOKEN", format!("Invalid JWT header: {}", e))
    })?;

    let kid = header.kid.ok_or_else(|| {
        ApiError::auth_error("AUTH_INVALID_TOKEN", "JWT header missing 'kid' field")
    })?;

    // Find matching JWK
    let jwk = jwks_cache.find_key(&kid).await?;

    // Convert JWK to DecodingKey
    let decoding_key = DecodingKey::from_jwk(&jwk).map_err(|e| {
        tracing::error!(error = %e, kid = %kid, "Failed to convert JWK to decoding key");
        ApiError::auth_error("AUTH_INVALID_TOKEN", "Failed to process signing key")
    })?;

    // Validate JWT with RS256
    let mut validation = Validation::new(Algorithm::RS256);
    validation.validate_exp = true;
    // Clerk tokens don't always have aud, so disable audience validation
    validation.validate_aud = false;

    let token_data =
        decode::<ClerkClaims>(token, &decoding_key, &validation).map_err(|e| match e.kind() {
            jsonwebtoken::errors::ErrorKind::ExpiredSignature => {
                ApiError::auth_error("AUTH_TOKEN_EXPIRED", "JWT token has expired")
            }
            jsonwebtoken::errors::ErrorKind::InvalidSignature => {
                ApiError::auth_error("AUTH_INVALID_TOKEN", "Invalid JWT signature")
            }
            _ => ApiError::auth_error(
                "AUTH_INVALID_TOKEN",
                format!("JWT validation failed: {}", e),
            ),
        })?;

    Ok(token_data.claims)
}

/// Extract the Bearer token from the Authorization header
fn extract_bearer_token(parts: &Parts) -> Result<&str, ApiError> {
    let auth_header = parts
        .headers
        .get(axum::http::header::AUTHORIZATION)
        .ok_or_else(|| {
            ApiError::auth_error("AUTH_MISSING_TOKEN", "Missing Authorization header")
        })?;

    let auth_value = auth_header.to_str().map_err(|_| {
        ApiError::auth_error(
            "AUTH_INVALID_TOKEN",
            "Invalid Authorization header encoding",
        )
    })?;

    auth_value.strip_prefix("Bearer ").ok_or_else(|| {
        ApiError::auth_error(
            "AUTH_INVALID_TOKEN",
            "Authorization header must use Bearer scheme",
        )
    })
}

/// Authenticated user extractor that validates JWT and resolves the user from the database.
///
/// Use this for handlers that require a known, database-backed user.
/// The extractor:
/// 1. Reads `Authorization: Bearer <token>` header
/// 2. Validates the JWT against Clerk's JWKS
/// 3. Looks up the user in the database by `clerk_user_id` (JWT `sub` claim)
///
/// Returns 401 with structured error codes on any failure.
pub struct AuthenticatedUser {
    pub user: User,
    pub clerk_user_id: String,
}

impl FromRequestParts<AppState> for AuthenticatedUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = extract_bearer_token(parts)?;

        let jwks_cache = state.jwks_cache.as_ref().ok_or_else(|| {
            ApiError::internal("JWT authentication not configured (missing CLERK_JWKS_URL)")
        })?;

        let claims = validate_jwt(token, jwks_cache).await?;

        // Look up user in database
        let user_repo = state
            .user_repo
            .as_ref()
            .ok_or_else(|| ApiError::service_unavailable("Database not configured"))?;

        let user = user_repo
            .find_by_clerk_id(&claims.sub)
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "Failed to look up user by Clerk ID");
                ApiError::internal("A database error occurred")
            })?
            .ok_or_else(|| {
                ApiError::auth_error(
                    "AUTH_USER_NOT_FOUND",
                    "Valid token but user not found in database",
                )
            })?;

        Ok(AuthenticatedUser {
            clerk_user_id: claims.sub,
            user,
        })
    }
}

/// Optional authentication extractor.
///
/// Returns `Some(AuthenticatedUser)` if a valid Bearer token is present and the user
/// exists in the database; returns `None` if no Authorization header is provided.
/// Returns an error only for malformed/expired tokens (not for missing tokens).
///
/// Use this for endpoints where authentication is optional (e.g., anonymous seal creation).
pub struct OptionalAuth(pub Option<AuthenticatedUser>);

impl FromRequestParts<AppState> for OptionalAuth {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        // No Authorization header → anonymous request (not an error)
        let token = match parts.headers.get(axum::http::header::AUTHORIZATION) {
            Some(header) => {
                let value = header.to_str().map_err(|_| {
                    ApiError::auth_error(
                        "AUTH_INVALID_TOKEN",
                        "Invalid Authorization header encoding",
                    )
                })?;
                match value.strip_prefix("Bearer ") {
                    Some(t) => t,
                    None => return Ok(OptionalAuth(None)),
                }
            }
            None => return Ok(OptionalAuth(None)),
        };

        let jwks_cache = match state.jwks_cache.as_ref() {
            Some(cache) => cache,
            None => return Ok(OptionalAuth(None)),
        };

        let claims = validate_jwt(token, jwks_cache).await?;

        let user_repo = match state.user_repo.as_ref() {
            Some(repo) => repo,
            None => return Ok(OptionalAuth(None)),
        };

        let user = user_repo.find_by_clerk_id(&claims.sub).await.map_err(|e| {
            tracing::error!(error = %e, "Failed to look up user by Clerk ID");
            ApiError::internal("A database error occurred")
        })?;

        match user {
            Some(user) => Ok(OptionalAuth(Some(AuthenticatedUser {
                clerk_user_id: claims.sub,
                user,
            }))),
            None => Ok(OptionalAuth(None)),
        }
    }
}

/// JWT claims extractor that validates the token without database lookup.
///
/// Use this for handlers where the user may not yet exist in the database
/// (e.g., the sync endpoint that creates users on first login).
pub struct JwtClaims {
    pub clerk_user_id: String,
}

impl FromRequestParts<AppState> for JwtClaims {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = extract_bearer_token(parts)?;

        let jwks_cache = state.jwks_cache.as_ref().ok_or_else(|| {
            ApiError::internal("JWT authentication not configured (missing CLERK_JWKS_URL)")
        })?;

        let claims = validate_jwt(token, jwks_cache).await?;

        Ok(JwtClaims {
            clerk_user_id: claims.sub,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::engine::general_purpose::{STANDARD as BASE64_STD, URL_SAFE_NO_PAD};
    use base64::Engine;
    use jsonwebtoken::{encode, EncodingKey, Header};
    use serde::Serialize;
    use std::time::{SystemTime, UNIX_EPOCH};

    /// Test JWT claims for creating test tokens
    #[derive(Debug, Serialize, Deserialize)]
    struct TestClaims {
        sub: String,
        exp: u64,
        iat: u64,
    }

    fn load_test_keys() -> (Vec<u8>, Vec<u8>) {
        let private_key = include_bytes!("../../tests/fixtures/test_rsa_private.pem");
        let public_key = include_bytes!("../../tests/fixtures/test_rsa_public.pem");
        (private_key.to_vec(), public_key.to_vec())
    }

    fn now_epoch() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
    }

    fn create_test_token(sub: &str, exp: u64, kid: &str, private_key_pem: &[u8]) -> String {
        let claims = TestClaims {
            sub: sub.to_string(),
            exp,
            iat: now_epoch(),
        };

        let mut header = Header::new(Algorithm::RS256);
        header.kid = Some(kid.to_string());

        let encoding_key = EncodingKey::from_rsa_pem(private_key_pem).unwrap();
        encode(&header, &claims, &encoding_key).unwrap()
    }

    /// Parse an ASN.1 length field, returning (length, new_offset)
    fn parse_asn1_length(data: &[u8], offset: usize) -> (usize, usize) {
        let b = data[offset];
        if b < 0x80 {
            (b as usize, offset + 1)
        } else {
            let num_bytes = (b & 0x7f) as usize;
            let mut length: usize = 0;
            for i in 0..num_bytes {
                length = (length << 8) | data[offset + 1 + i] as usize;
            }
            (length, offset + 1 + num_bytes)
        }
    }

    /// Parse an ASN.1 INTEGER, returning (value_bytes_without_leading_zero, new_offset)
    fn parse_asn1_integer(data: &[u8], offset: usize) -> (Vec<u8>, usize) {
        assert_eq!(data[offset], 0x02, "Expected INTEGER tag");
        let (length, offset) = parse_asn1_length(data, offset + 1);
        let mut value = data[offset..offset + length].to_vec();
        // Strip leading zero byte (sign byte for positive integers)
        if !value.is_empty() && value[0] == 0 {
            value.remove(0);
        }
        (value, offset + length)
    }

    /// Extract RSA n and e from a DER-encoded SubjectPublicKeyInfo
    fn extract_rsa_components_from_pem(pem: &[u8]) -> (Vec<u8>, Vec<u8>) {
        // Decode PEM to DER
        let pem_str = std::str::from_utf8(pem).unwrap();
        let der_b64: String = pem_str
            .lines()
            .filter(|line| !line.starts_with("-----"))
            .collect();
        let der = BASE64_STD.decode(&der_b64).unwrap();

        // Parse SubjectPublicKeyInfo ASN.1:
        // SEQUENCE { algorithm SEQUENCE, subjectPublicKey BIT STRING { SEQUENCE { n INTEGER, e INTEGER } } }
        let mut offset = 0;

        // Outer SEQUENCE
        assert_eq!(der[offset], 0x30);
        let (_, new_offset) = parse_asn1_length(&der, offset + 1);
        offset = new_offset;

        // Algorithm SEQUENCE - skip it
        assert_eq!(der[offset], 0x30);
        let (algo_len, algo_offset) = parse_asn1_length(&der, offset + 1);
        offset = algo_offset + algo_len;

        // BIT STRING
        assert_eq!(der[offset], 0x03);
        let (_, new_offset) = parse_asn1_length(&der, offset + 1);
        offset = new_offset;
        offset += 1; // skip unused bits byte

        // Inner SEQUENCE (RSA public key)
        assert_eq!(der[offset], 0x30);
        let (_, new_offset) = parse_asn1_length(&der, offset + 1);
        offset = new_offset;

        // n INTEGER
        let (n, offset) = parse_asn1_integer(&der, offset);
        // e INTEGER
        let (e, _) = parse_asn1_integer(&der, offset);

        (n, e)
    }

    /// Create a mock JwksCache with pre-loaded keys (no HTTP fetching)
    fn create_mock_jwks_cache(public_key_pem: &[u8], kid: &str) -> JwksCache {
        let (n_bytes, e_bytes) = extract_rsa_components_from_pem(public_key_pem);
        let n = URL_SAFE_NO_PAD.encode(&n_bytes);
        let e = URL_SAFE_NO_PAD.encode(&e_bytes);

        let jwk_json = serde_json::json!({
            "kty": "RSA",
            "kid": kid,
            "use": "sig",
            "alg": "RS256",
            "n": n,
            "e": e
        });

        let jwk_value: jwk::Jwk = serde_json::from_value(jwk_json).unwrap();

        JwksCache {
            keys: RwLock::new(Some(CachedJwks {
                keys: vec![jwk_value],
                fetched_at: Instant::now(),
            })),
            jwks_url: "http://test.invalid/.well-known/jwks.json".to_string(),
            http_client: reqwest::Client::new(),
        }
    }

    #[tokio::test]
    async fn test_valid_jwt_validation() {
        let (private_key, public_key) = load_test_keys();
        let kid = "test-key-1";
        let exp = now_epoch() + 3600;

        let token = create_test_token("user_clerk123", exp, kid, &private_key);
        let cache = create_mock_jwks_cache(&public_key, kid);

        let claims = validate_jwt(&token, &cache).await.unwrap();
        assert_eq!(claims.sub, "user_clerk123");
    }

    #[tokio::test]
    async fn test_expired_jwt() {
        let (private_key, public_key) = load_test_keys();
        let kid = "test-key-1";
        let exp = now_epoch() - 3600;

        let token = create_test_token("user_clerk123", exp, kid, &private_key);
        let cache = create_mock_jwks_cache(&public_key, kid);

        let err = validate_jwt(&token, &cache).await.unwrap_err();
        match err {
            ApiError::AuthError { code, .. } => assert_eq!(code, "AUTH_TOKEN_EXPIRED"),
            other => panic!(
                "Expected AuthError with AUTH_TOKEN_EXPIRED, got: {:?}",
                other
            ),
        }
    }

    #[tokio::test]
    async fn test_unknown_kid() {
        let (private_key, public_key) = load_test_keys();
        let exp = now_epoch() + 3600;

        let token = create_test_token("user_clerk123", exp, "unknown-key", &private_key);
        let cache = create_mock_jwks_cache(&public_key, "test-key-1");

        let err = validate_jwt(&token, &cache).await.unwrap_err();
        match err {
            ApiError::AuthError { code, .. } => assert_eq!(code, "AUTH_UNKNOWN_KEY"),
            other => panic!("Expected AuthError with AUTH_UNKNOWN_KEY, got: {:?}", other),
        }
    }

    #[tokio::test]
    async fn test_invalid_token() {
        let (_, public_key) = load_test_keys();
        let cache = create_mock_jwks_cache(&public_key, "test-key-1");

        let err = validate_jwt("not-a-valid-jwt", &cache).await.unwrap_err();
        match err {
            ApiError::AuthError { code, .. } => assert_eq!(code, "AUTH_INVALID_TOKEN"),
            other => panic!(
                "Expected AuthError with AUTH_INVALID_TOKEN, got: {:?}",
                other
            ),
        }
    }

    #[test]
    fn test_extract_bearer_token_missing_header() {
        let (parts, _) = axum::http::Request::builder()
            .body(())
            .unwrap()
            .into_parts();

        let err = extract_bearer_token(&parts).unwrap_err();
        match err {
            ApiError::AuthError { code, .. } => assert_eq!(code, "AUTH_MISSING_TOKEN"),
            other => panic!(
                "Expected AuthError with AUTH_MISSING_TOKEN, got: {:?}",
                other
            ),
        }
    }

    #[test]
    fn test_extract_bearer_token_wrong_scheme() {
        let (parts, _) = axum::http::Request::builder()
            .header("Authorization", "Basic dXNlcjpwYXNz")
            .body(())
            .unwrap()
            .into_parts();

        let err = extract_bearer_token(&parts).unwrap_err();
        match err {
            ApiError::AuthError { code, .. } => assert_eq!(code, "AUTH_INVALID_TOKEN"),
            other => panic!(
                "Expected AuthError with AUTH_INVALID_TOKEN, got: {:?}",
                other
            ),
        }
    }

    #[test]
    fn test_extract_bearer_token_success() {
        let (parts, _) = axum::http::Request::builder()
            .header("Authorization", "Bearer my-jwt-token")
            .body(())
            .unwrap()
            .into_parts();

        let token = extract_bearer_token(&parts).unwrap();
        assert_eq!(token, "my-jwt-token");
    }

    #[tokio::test]
    async fn test_jwks_cache_returns_cached_keys() {
        let (_, public_key) = load_test_keys();
        let cache = create_mock_jwks_cache(&public_key, "test-key-1");

        let keys = cache.get_keys().await.unwrap();
        assert_eq!(keys.len(), 1);

        // Second call should still return cached keys
        let keys = cache.get_keys().await.unwrap();
        assert_eq!(keys.len(), 1);
        assert_eq!(keys[0].common.key_id.as_deref(), Some("test-key-1"));
    }
}
