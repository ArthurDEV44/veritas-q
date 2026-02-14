//! Server configuration module
//!
//! Handles loading configuration from environment variables with sensible defaults.

use base64::engine::general_purpose::STANDARD_NO_PAD as BASE64;
use base64::Engine;
use std::net::SocketAddr;

/// Server configuration loaded from environment variables
#[derive(Debug, Clone)]
pub struct Config {
    /// Server port (default: 3000)
    pub port: u16,
    /// Server host (default: 127.0.0.1)
    pub host: [u8; 4],
    /// Allowed CORS origins, comma-separated (default: allow all in dev)
    pub allowed_origins: Option<Vec<String>>,
    /// Request body limit in MB (default: 50)
    pub body_limit_mb: usize,
    /// Maximum file size per upload in MB (default: 25)
    pub max_file_size_mb: usize,
    /// Request timeout in seconds (default: 30)
    pub timeout_secs: u64,
    /// Enable rate limiting (default: false for tests, true when loaded from env)
    pub rate_limit_enabled: bool,
    /// Rate limit: requests per second (default: 10)
    pub rate_limit_per_sec: u64,
    /// Rate limit: burst size (default: 20)
    pub rate_limit_burst: u32,
    /// Clerk JWKS URL for JWT validation (enables JWT auth when set)
    pub clerk_jwks_url: Option<String>,
    /// Allow mock QRNG usage (default: false, enable with ALLOW_MOCK_QRNG=true)
    pub allow_mock_qrng: bool,
    /// Database connection pool maximum connections (default: 20)
    pub database_max_connections: u32,
    /// Database connection pool minimum connections (default: 2)
    pub database_min_connections: u32,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            port: 3000,
            host: [127, 0, 0, 1],
            allowed_origins: None, // None = allow all (dev mode)
            body_limit_mb: 50,
            max_file_size_mb: 25,
            timeout_secs: 30,
            rate_limit_enabled: false, // Disabled by default (for tests)
            rate_limit_per_sec: 10,
            rate_limit_burst: 20,
            clerk_jwks_url: None,
            allow_mock_qrng: true, // Enabled by default for tests; from_env() defaults to false
            database_max_connections: 20,
            database_min_connections: 2,
        }
    }
}

impl Config {
    /// Load configuration from environment variables
    pub fn from_env() -> Self {
        let port = std::env::var("PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(3000);

        let host = std::env::var("HOST")
            .ok()
            .map(|h| {
                if h == "0.0.0.0" {
                    [0, 0, 0, 0]
                } else {
                    [127, 0, 0, 1]
                }
            })
            .unwrap_or([127, 0, 0, 1]);

        let allowed_origins = std::env::var("ALLOWED_ORIGINS").ok().map(|origins| {
            origins
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        });

        let body_limit_mb = std::env::var("BODY_LIMIT_MB")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(50);

        let max_file_size_mb = std::env::var("MAX_FILE_SIZE_MB")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(25);

        let timeout_secs = std::env::var("REQUEST_TIMEOUT_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(30);

        let rate_limit_per_sec = std::env::var("RATE_LIMIT_PER_SEC")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(10);

        let rate_limit_burst = std::env::var("RATE_LIMIT_BURST")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(20);

        // Rate limiting enabled by default in production, can be disabled with RATE_LIMIT_ENABLED=false
        let rate_limit_enabled = std::env::var("RATE_LIMIT_ENABLED")
            .map(|v| v.to_lowercase() != "false")
            .unwrap_or(true);

        let clerk_jwks_url = std::env::var("CLERK_JWKS_URL").ok().or_else(|| {
            // Auto-derive JWKS URL from Clerk publishable key if available.
            // The publishable key encodes the frontend API domain in base64:
            //   pk_test_<base64(domain)>  or  pk_live_<base64(domain)>
            let pk = std::env::var("CLERK_PUBLISHABLE_KEY")
                .or_else(|_| std::env::var("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"))
                .ok()?;
            derive_jwks_url_from_publishable_key(&pk)
        });

        let allow_mock_qrng = std::env::var("ALLOW_MOCK_QRNG")
            .map(|v| v.to_lowercase() == "true")
            .unwrap_or(false);

        let database_max_connections = std::env::var("DATABASE_MAX_CONNECTIONS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(20);

        let database_min_connections = std::env::var("DATABASE_MIN_CONNECTIONS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(2);

        Self {
            port,
            host,
            allowed_origins,
            body_limit_mb,
            max_file_size_mb,
            timeout_secs,
            rate_limit_enabled,
            rate_limit_per_sec,
            rate_limit_burst,
            clerk_jwks_url,
            allow_mock_qrng,
            database_max_connections,
            database_min_connections,
        }
    }

    /// Get socket address from config
    pub fn socket_addr(&self) -> SocketAddr {
        SocketAddr::from((self.host, self.port))
    }
}

/// Derive the Clerk JWKS URL from a Clerk publishable key.
///
/// Clerk publishable keys encode the frontend API domain in base64:
///   `pk_test_<base64(domain$)>` or `pk_live_<base64(domain$)>`
///
/// The JWKS URL is `https://<domain>/.well-known/jwks.json`.
fn derive_jwks_url_from_publishable_key(pk: &str) -> Option<String> {
    let encoded = pk
        .strip_prefix("pk_test_")
        .or_else(|| pk.strip_prefix("pk_live_"))?;

    // Strip any trailing '=' padding — we use the no-pad decoder
    let b64 = encoded.trim_end_matches('=');

    if b64.is_empty() {
        return None;
    }

    let decoded = BASE64.decode(b64).ok()?;
    let raw = String::from_utf8(decoded).ok()?;

    // Clerk appends a '$' terminator to the encoded domain
    let domain = raw.trim_end_matches('$');

    if domain.is_empty() {
        return None;
    }

    let url = format!("https://{}/.well-known/jwks.json", domain);
    tracing::info!("Derived CLERK_JWKS_URL from publishable key: {}", url);
    Some(url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_derive_jwks_url_from_test_key() {
        // pk_test_ with base64("above-treefrog-89.clerk.accounts.dev$")
        let pk = "pk_test_YWJvdmUtdHJlZWZyb2ctODkuY2xlcmsuYWNjb3VudHMuZGV2JA";
        let url = derive_jwks_url_from_publishable_key(pk).unwrap();
        assert_eq!(
            url,
            "https://above-treefrog-89.clerk.accounts.dev/.well-known/jwks.json"
        );
    }

    #[test]
    fn test_derive_jwks_url_from_live_key() {
        // pk_live_ prefix should also work
        let pk = "pk_live_YWJvdmUtdHJlZWZyb2ctODkuY2xlcmsuYWNjb3VudHMuZGV2JA";
        let url = derive_jwks_url_from_publishable_key(pk).unwrap();
        assert_eq!(
            url,
            "https://above-treefrog-89.clerk.accounts.dev/.well-known/jwks.json"
        );
    }

    #[test]
    fn test_derive_jwks_url_invalid_prefix() {
        assert!(derive_jwks_url_from_publishable_key("sk_test_abc").is_none());
        assert!(derive_jwks_url_from_publishable_key("random").is_none());
        assert!(derive_jwks_url_from_publishable_key("").is_none());
    }

    #[test]
    fn test_derive_jwks_url_invalid_base64() {
        assert!(derive_jwks_url_from_publishable_key("pk_test_!!!invalid!!!").is_none());
    }

    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.port, 3000);
        assert!(config.clerk_jwks_url.is_none());
        assert!(config.allow_mock_qrng);
    }
}
