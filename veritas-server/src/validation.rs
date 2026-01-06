//! Upload validation module
//!
//! Provides validation utilities for multipart file uploads.

use crate::error::ApiError;

/// Allowed MIME type categories for media uploads
const ALLOWED_MIME_PREFIXES: &[&str] = &["image/", "video/", "audio/", "application/octet-stream"];

/// Default max file size in bytes (25 MB)
pub const DEFAULT_MAX_FILE_SIZE: usize = 25 * 1024 * 1024;

/// Validates the Content-Type of an uploaded file
///
/// Accepts:
/// - image/* (image/jpeg, image/png, image/webp, etc.)
/// - video/* (video/mp4, video/webm, etc.)
/// - audio/* (audio/mpeg, audio/wav, etc.)
/// - application/octet-stream (binary data)
///
/// Returns an error if the Content-Type is not supported.
pub fn validate_content_type(content_type: Option<&str>) -> Result<(), ApiError> {
    match content_type {
        Some(ct) => {
            let ct_lower = ct.to_lowercase();
            if ALLOWED_MIME_PREFIXES
                .iter()
                .any(|prefix| ct_lower.starts_with(prefix))
            {
                Ok(())
            } else {
                Err(ApiError::bad_request(format!(
                    "Unsupported Content-Type: '{}'. Allowed types: image/*, video/*, audio/*, application/octet-stream",
                    ct
                )))
            }
        }
        // Allow missing Content-Type (treat as binary)
        None => Ok(()),
    }
}

/// Validates the size of an uploaded file
///
/// Returns an error if the file exceeds the maximum size.
pub fn validate_file_size(size: usize, max_size: usize) -> Result<(), ApiError> {
    if size > max_size {
        let max_mb = max_size / (1024 * 1024);
        let actual_mb = size / (1024 * 1024);
        Err(ApiError::bad_request(format!(
            "File too large: {} MB exceeds maximum of {} MB",
            actual_mb, max_mb
        )))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_content_type_image() {
        assert!(validate_content_type(Some("image/jpeg")).is_ok());
        assert!(validate_content_type(Some("image/png")).is_ok());
        assert!(validate_content_type(Some("image/webp")).is_ok());
        assert!(validate_content_type(Some("IMAGE/JPEG")).is_ok()); // case insensitive
    }

    #[test]
    fn test_validate_content_type_video() {
        assert!(validate_content_type(Some("video/mp4")).is_ok());
        assert!(validate_content_type(Some("video/webm")).is_ok());
    }

    #[test]
    fn test_validate_content_type_audio() {
        assert!(validate_content_type(Some("audio/mpeg")).is_ok());
        assert!(validate_content_type(Some("audio/wav")).is_ok());
    }

    #[test]
    fn test_validate_content_type_binary() {
        assert!(validate_content_type(Some("application/octet-stream")).is_ok());
    }

    #[test]
    fn test_validate_content_type_none() {
        assert!(validate_content_type(None).is_ok());
    }

    #[test]
    fn test_validate_content_type_rejected() {
        assert!(validate_content_type(Some("text/html")).is_err());
        assert!(validate_content_type(Some("application/json")).is_err());
        assert!(validate_content_type(Some("text/javascript")).is_err());
    }

    #[test]
    fn test_validate_file_size_ok() {
        let max = 10 * 1024 * 1024; // 10 MB
        assert!(validate_file_size(1024, max).is_ok()); // 1 KB
        assert!(validate_file_size(5 * 1024 * 1024, max).is_ok()); // 5 MB
        assert!(validate_file_size(max, max).is_ok()); // exactly max
    }

    #[test]
    fn test_validate_file_size_too_large() {
        let max = 10 * 1024 * 1024; // 10 MB
        assert!(validate_file_size(max + 1, max).is_err());
        assert!(validate_file_size(20 * 1024 * 1024, max).is_err());
    }
}
