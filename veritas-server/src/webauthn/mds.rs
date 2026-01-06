//! FIDO Metadata Service (MDS) integration
//!
//! Provides device model lookup from the FIDO Alliance Metadata Service.
//! This allows identification of authenticator models by their AAGUID.

use super::types::DeviceModel;

/// Known authenticator AAGUIDs with their descriptions
/// This is a static fallback when MDS is unavailable
static KNOWN_AUTHENTICATORS: &[(&str, &str, &str)] = &[
    // Apple
    (
        "00000000-0000-0000-0000-000000000000",
        "Apple Touch ID / Face ID",
        "Apple",
    ),
    (
        "f24a8e70-d0d3-f82c-2937-32523cc4de5a",
        "Apple iCloud Keychain",
        "Apple",
    ),
    // Google
    (
        "adce0002-35bc-c60a-648b-0b25f1f05503",
        "Google Password Manager",
        "Google",
    ),
    (
        "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4",
        "Google Titan Security Key",
        "Google",
    ),
    // Microsoft
    (
        "6028b017-b1d4-4c02-b4b3-afcdafc96bb2",
        "Windows Hello",
        "Microsoft",
    ),
    (
        "08987058-cadc-4b81-b6e1-30de50dcbe96",
        "Windows Hello Hardware",
        "Microsoft",
    ),
    // Yubico
    (
        "2fc0579f-8113-47ea-b116-bb5a8db9202a",
        "YubiKey 5 NFC",
        "Yubico",
    ),
    (
        "c5ef55ff-ad9a-4b9f-b580-adebafe026d0",
        "YubiKey 5Ci",
        "Yubico",
    ),
    (
        "fa2b99dc-9e39-4257-8f92-4a30d23c4118",
        "YubiKey 5 FIPS",
        "Yubico",
    ),
    (
        "73bb0cd4-e502-49b8-9c6f-b59445bf720b",
        "YubiKey 5 Bio",
        "Yubico",
    ),
    // Feitian
    (
        "77010bd7-212a-4fc9-b236-d2ca5e9d4084",
        "Feitian BioPass K27",
        "Feitian",
    ),
    (
        "3e22415d-7fdf-4ea4-8a0c-dd60c4249b9d",
        "Feitian ePass FIDO2",
        "Feitian",
    ),
    // 1Password
    (
        "bada5566-a7aa-401f-bd96-45619a55120d",
        "1Password",
        "1Password",
    ),
    // Dashlane
    (
        "d548826e-79b4-db40-a3d8-11116f7e8349",
        "Dashlane",
        "Dashlane",
    ),
    // Samsung
    (
        "53414d53-554e-4700-0000-000000000000",
        "Samsung Pass",
        "Samsung",
    ),
];

/// Lookup device model from FIDO MDS by AAGUID
///
/// Currently uses a static list of known authenticators.
/// In production, this should fetch and cache the FIDO MDS blob.
pub async fn lookup_device_model(aaguid_str: &str) -> Result<DeviceModel, MdsError> {
    // First check static list
    for (known_aaguid, description, vendor) in KNOWN_AUTHENTICATORS {
        if aaguid_str == *known_aaguid {
            return Ok(DeviceModel {
                aaguid: aaguid_str.to_string(),
                description: description.to_string(),
                vendor: Some(vendor.to_string()),
                certification_level: None,
            });
        }
    }

    // If AAGUID is all zeros, it's likely a platform authenticator
    if aaguid_str == "00000000-0000-0000-0000-000000000000" {
        return Ok(DeviceModel {
            aaguid: aaguid_str.to_string(),
            description: "Platform Authenticator".to_string(),
            vendor: None,
            certification_level: None,
        });
    }

    // TODO: Implement full MDS blob fetching and caching
    // The FIDO MDS blob is a JWT that needs to be:
    // 1. Fetched from https://mds3.fidoalliance.org/
    // 2. Verified against FIDO root certificate
    // 3. Decoded and cached
    // 4. Updated periodically (daily recommended)

    Err(MdsError::AaguidNotFound(aaguid_str.to_string()))
}

/// Errors from MDS operations
#[derive(Debug, thiserror::Error)]
#[allow(dead_code)]
pub enum MdsError {
    #[error("AAGUID not found in MDS: {0}")]
    AaguidNotFound(String),

    #[error("Failed to fetch MDS: {0}")]
    FetchError(String),

    #[error("Failed to parse MDS: {0}")]
    ParseError(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_known_authenticator_lookup() {
        let result = lookup_device_model("2fc0579f-8113-47ea-b116-bb5a8db9202a").await;
        assert!(result.is_ok());
        let model = result.unwrap();
        assert!(model.description.contains("YubiKey"));
        assert_eq!(model.vendor, Some("Yubico".to_string()));
    }

    #[tokio::test]
    async fn test_unknown_authenticator() {
        let result = lookup_device_model("ffffffff-ffff-ffff-ffff-ffffffffffff").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_zero_aaguid() {
        let result = lookup_device_model("00000000-0000-0000-0000-000000000000").await;
        assert!(result.is_ok());
        let model = result.unwrap();
        // Zero AAGUID is mapped to Apple Touch ID in KNOWN_AUTHENTICATORS
        // or falls back to "Platform Authenticator"
        assert!(
            model.description.contains("Apple") || model.description.contains("Platform"),
            "Expected Apple or Platform, got: {}",
            model.description
        );
    }
}
