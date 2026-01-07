//! WebAuthn Relying Party configuration
//!
//! Configures the WebAuthn library with Relying Party (RP) identity.

use url::Url;
use webauthn_rs::prelude::*;

/// Configuration errors
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("Invalid origin URL: {0}")]
    InvalidOrigin(String),
    #[error("WebAuthn error: {0:?}")]
    Webauthn(WebauthnError),
}

/// WebAuthn configuration wrapper
pub struct WebAuthnConfig {
    webauthn: Webauthn,
}

impl WebAuthnConfig {
    /// Create a new WebAuthn configuration
    ///
    /// # Arguments
    ///
    /// * `rp_id` - Relying Party ID (typically the domain name)
    /// * `rp_origin` - Relying Party origin URL
    /// * `rp_name` - Human-readable name for the Relying Party
    pub fn new(rp_id: &str, rp_origin: &Url, rp_name: &str) -> Result<Self, WebauthnError> {
        Self::new_with_origins(rp_id, rp_origin, rp_name, &[], false)
    }

    /// Create a new WebAuthn configuration with additional origins
    ///
    /// # Arguments
    ///
    /// * `rp_id` - Relying Party ID (typically the domain name)
    /// * `rp_origin` - Primary Relying Party origin URL
    /// * `rp_name` - Human-readable name for the Relying Party
    /// * `additional_origins` - Additional allowed origins (for mobile apps, multiple domains)
    /// * `allow_any_port` - Skip port validation (useful for development)
    pub fn new_with_origins(
        rp_id: &str,
        rp_origin: &Url,
        rp_name: &str,
        additional_origins: &[Url],
        allow_any_port: bool,
    ) -> Result<Self, WebauthnError> {
        let mut builder = WebauthnBuilder::new(rp_id, rp_origin)?
            .rp_name(rp_name)
            .allow_subdomains(false)
            .allow_any_port(allow_any_port);

        // Add additional origins for mobile apps or multiple domains
        for origin in additional_origins {
            builder = builder.append_allowed_origin(origin);
        }

        tracing::info!(
            rp_id = %rp_id,
            rp_origin = %rp_origin,
            additional_origins = additional_origins.len(),
            allow_any_port = allow_any_port,
            "WebAuthn configured"
        );

        Ok(Self {
            webauthn: builder.build()?,
        })
    }

    /// Create configuration from environment variables
    ///
    /// Environment variables:
    /// - `WEBAUTHN_RP_ID` - Relying Party ID (default: "localhost")
    /// - `WEBAUTHN_RP_ORIGIN` - Primary RP origin URL (default: "http://localhost:3001")
    /// - `WEBAUTHN_RP_ORIGINS` - Additional allowed origins, comma-separated (optional)
    /// - `WEBAUTHN_RP_NAME` - RP display name (default: "Veritas Q")
    /// - `WEBAUTHN_ALLOW_ANY_PORT` - Skip port validation (default: false, true for localhost)
    pub fn from_env() -> Result<Self, ConfigError> {
        let rp_id = std::env::var("WEBAUTHN_RP_ID").unwrap_or_else(|_| "localhost".to_string());
        let rp_origin = std::env::var("WEBAUTHN_RP_ORIGIN")
            .unwrap_or_else(|_| "http://localhost:3001".to_string());
        let rp_name = std::env::var("WEBAUTHN_RP_NAME").unwrap_or_else(|_| "Veritas Q".to_string());

        let origin =
            Url::parse(&rp_origin).map_err(|e| ConfigError::InvalidOrigin(format!("{}", e)))?;

        // Check if we should allow any port (useful for development)
        let allow_any_port = std::env::var("WEBAUTHN_ALLOW_ANY_PORT")
            .map(|v| v == "true" || v == "1")
            .unwrap_or_else(|_| rp_id == "localhost");

        // Parse additional origins
        let additional_origins: Vec<Url> = std::env::var("WEBAUTHN_RP_ORIGINS")
            .unwrap_or_default()
            .split(',')
            .filter_map(|s| {
                let s = s.trim();
                if s.is_empty() {
                    None
                } else {
                    Url::parse(s).ok()
                }
            })
            .collect();

        Self::new_with_origins(
            &rp_id,
            &origin,
            &rp_name,
            &additional_origins,
            allow_any_port,
        )
        .map_err(ConfigError::Webauthn)
    }

    /// Get a reference to the Webauthn instance
    pub fn webauthn(&self) -> &Webauthn {
        &self.webauthn
    }
}

impl std::fmt::Debug for WebAuthnConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("WebAuthnConfig")
            .field("webauthn", &"<Webauthn instance>")
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_creation() {
        let origin = Url::parse("http://localhost:3001").unwrap();
        let config = WebAuthnConfig::new("localhost", &origin, "Test").unwrap();
        assert!(config.webauthn().get_allowed_origins().contains(&origin));
    }

    #[test]
    fn test_config_from_env_defaults() {
        // Clear any existing env vars
        std::env::remove_var("WEBAUTHN_RP_ID");
        std::env::remove_var("WEBAUTHN_RP_ORIGIN");
        std::env::remove_var("WEBAUTHN_RP_NAME");

        let config = WebAuthnConfig::from_env().unwrap();
        let expected_origin = Url::parse("http://localhost:3001").unwrap();
        assert!(config
            .webauthn()
            .get_allowed_origins()
            .contains(&expected_origin));
    }
}
