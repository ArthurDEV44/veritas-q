//! Server configuration module
//!
//! Handles loading configuration from environment variables with sensible defaults.

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
    /// Request timeout in seconds (default: 30)
    pub timeout_secs: u64,
    /// Enable rate limiting (default: false for tests, true when loaded from env)
    pub rate_limit_enabled: bool,
    /// Rate limit: requests per second (default: 10)
    pub rate_limit_per_sec: u64,
    /// Rate limit: burst size (default: 20)
    pub rate_limit_burst: u32,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            port: 3000,
            host: [127, 0, 0, 1],
            allowed_origins: None, // None = allow all (dev mode)
            body_limit_mb: 50,
            timeout_secs: 30,
            rate_limit_enabled: false, // Disabled by default (for tests)
            rate_limit_per_sec: 10,
            rate_limit_burst: 20,
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

        Self {
            port,
            host,
            allowed_origins,
            body_limit_mb,
            timeout_secs,
            rate_limit_enabled,
            rate_limit_per_sec,
            rate_limit_burst,
        }
    }

    /// Get socket address from config
    pub fn socket_addr(&self) -> SocketAddr {
        SocketAddr::from((self.host, self.port))
    }
}
