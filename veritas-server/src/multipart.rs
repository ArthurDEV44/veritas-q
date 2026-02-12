//! Multipart form parsing helpers
//!
//! Provides reusable abstractions for parsing multipart/form-data uploads,
//! reducing code duplication across handlers.

use std::collections::HashMap;

use axum::extract::Multipart;
use serde::de::DeserializeOwned;

use crate::error::ApiError;
use crate::validation::{validate_content_type, validate_file_size};

/// Represents a file uploaded via multipart form
#[derive(Debug, Clone)]
pub struct FileField {
    /// File data bytes
    pub data: Vec<u8>,
    /// Content-Type from the multipart field (if provided)
    pub content_type: Option<String>,
    /// Original filename from the multipart field (if provided)
    pub file_name: Option<String>,
}

/// Parsed multipart form fields
///
/// Provides structured access to file and text fields from a multipart/form-data request.
/// Handles validation, type conversion, and JSON parsing.
#[derive(Debug)]
pub struct MultipartFields {
    /// File field (typically named "file")
    file: Option<FileField>,
    /// Text fields indexed by name
    text_fields: HashMap<String, String>,
}

impl MultipartFields {
    /// Parse all fields from a multipart request
    ///
    /// # Arguments
    /// * `multipart` - The Axum multipart extractor
    /// * `validate_content_type` - Whether to validate the file Content-Type header
    /// * `max_file_size` - Maximum allowed file size in bytes
    ///
    /// # Returns
    /// Parsed fields or an error if validation fails
    ///
    /// # Example
    /// ```ignore
    /// let fields = MultipartFields::parse(
    ///     &mut multipart,
    ///     true,  // validate content type
    ///     DEFAULT_MAX_FILE_SIZE
    /// ).await?;
    /// ```
    pub async fn parse(
        multipart: &mut Multipart,
        validate_content_type_flag: bool,
        max_file_size: usize,
    ) -> Result<Self, ApiError> {
        let mut file: Option<FileField> = None;
        let mut text_fields = HashMap::new();

        while let Some(field) = multipart
            .next_field()
            .await
            .map_err(|e| ApiError::bad_request(format!("Failed to parse multipart: {}", e)))?
        {
            let name = field.name().unwrap_or("").to_string();

            if name == "file" {
                // Extract file metadata
                let content_type = field.content_type().map(|s| s.to_string());
                let file_name = field.file_name().map(|s| s.to_string());

                // Validate Content-Type if requested
                if validate_content_type_flag {
                    validate_content_type(content_type.as_deref())?;
                }

                // Read file data
                let data = field
                    .bytes()
                    .await
                    .map_err(|e| ApiError::bad_request(format!("Failed to read file: {}", e)))?
                    .to_vec();

                // Validate file size
                validate_file_size(data.len(), max_file_size)?;

                file = Some(FileField {
                    data,
                    content_type,
                    file_name,
                });
            } else {
                // Text field
                let value = field.text().await.map_err(|e| {
                    ApiError::bad_request(format!("Failed to read field '{}': {}", name, e))
                })?;
                text_fields.insert(name, value);
            }
        }

        Ok(Self { file, text_fields })
    }

    /// Get the file field (required)
    ///
    /// Returns an error if no file was uploaded.
    pub fn require_file(&self) -> Result<&FileField, ApiError> {
        self.file.as_ref().ok_or_else(|| {
            ApiError::bad_request("No file provided. Use 'file' field in multipart form.")
        })
    }

    /// Get the file field (optional)
    pub fn get_file(&self) -> Option<&FileField> {
        self.file.as_ref()
    }

    /// Get a text field value
    ///
    /// Returns `None` if the field is not present.
    pub fn get_text(&self, name: &str) -> Option<&str> {
        self.text_fields.get(name).map(|s| s.as_str())
    }

    /// Get a text field parsed as a boolean
    ///
    /// Returns `true` if the field value is "true" (case-insensitive), `false` otherwise.
    pub fn get_bool(&self, name: &str) -> bool {
        self.text_fields
            .get(name)
            .map(|s| s.to_lowercase() == "true")
            .unwrap_or(false)
    }

    /// Get a text field parsed as JSON
    ///
    /// Returns:
    /// - `Ok(Some(T))` if the field exists and is valid JSON
    /// - `Ok(None)` if the field is missing or empty
    /// - `Err(ApiError)` if the field exists but JSON parsing fails
    ///
    /// # Example
    /// ```ignore
    /// let location: Option<LocationInput> = fields.get_json("location")?;
    /// ```
    pub fn get_json<T: DeserializeOwned>(&self, name: &str) -> Result<Option<T>, ApiError> {
        match self.text_fields.get(name) {
            Some(json) if !json.is_empty() => {
                let value: T = serde_json::from_str(json)
                    .map_err(|e| ApiError::bad_request(format!("Invalid {} JSON: {}", name, e)))?;
                Ok(Some(value))
            }
            _ => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_bool() {
        let mut text_fields = HashMap::new();
        text_fields.insert("flag1".to_string(), "true".to_string());
        text_fields.insert("flag2".to_string(), "false".to_string());
        text_fields.insert("flag3".to_string(), "TRUE".to_string());
        text_fields.insert("flag4".to_string(), "yes".to_string());

        let fields = MultipartFields {
            file: None,
            text_fields,
        };

        assert_eq!(fields.get_bool("flag1"), true);
        assert_eq!(fields.get_bool("flag2"), false);
        assert_eq!(fields.get_bool("flag3"), true);
        assert_eq!(fields.get_bool("flag4"), false);
        assert_eq!(fields.get_bool("missing"), false);
    }

    #[test]
    fn test_get_text() {
        let mut text_fields = HashMap::new();
        text_fields.insert("name".to_string(), "test".to_string());

        let fields = MultipartFields {
            file: None,
            text_fields,
        };

        assert_eq!(fields.get_text("name"), Some("test"));
        assert_eq!(fields.get_text("missing"), None);
    }

    #[test]
    fn test_require_file_missing() {
        let fields = MultipartFields {
            file: None,
            text_fields: HashMap::new(),
        };

        assert!(fields.require_file().is_err());
    }
}
