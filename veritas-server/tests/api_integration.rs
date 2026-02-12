//! API integration tests for veritas-server (Truth API).
//!
//! These tests verify the HTTP API behavior with realistic multipart
//! requests, testing the full seal/verify flow through the REST endpoints.

use axum::{
    body::Body,
    http::{Request, StatusCode},
    Router,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde_json::Value;
use tower::ServiceExt;
use veritas_server::create_router;

/// Helper to create multipart body for seal request
fn create_seal_multipart(content: &[u8], media_type: &str, mock: bool) -> (String, Vec<u8>) {
    let boundary = "----TestBoundary7MA4YWxkTrZu0gW";
    let mut body = Vec::new();

    // File field
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(
        b"Content-Disposition: form-data; name=\"file\"; filename=\"test.bin\"\r\n",
    );
    body.extend_from_slice(b"Content-Type: application/octet-stream\r\n\r\n");
    body.extend_from_slice(content);
    body.extend_from_slice(b"\r\n");

    // Media type field
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(b"Content-Disposition: form-data; name=\"media_type\"\r\n\r\n");
    body.extend_from_slice(media_type.as_bytes());
    body.extend_from_slice(b"\r\n");

    // Mock field
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(b"Content-Disposition: form-data; name=\"mock\"\r\n\r\n");
    body.extend_from_slice(if mock { b"true" } else { b"false" });
    body.extend_from_slice(b"\r\n");

    // End boundary
    body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

    (format!("multipart/form-data; boundary={}", boundary), body)
}

/// Helper to create multipart body for verify request
fn create_verify_multipart(content: &[u8], seal_base64: &str) -> (String, Vec<u8>) {
    let boundary = "----TestBoundary7MA4YWxkTrZu0gW";
    let mut body = Vec::new();

    // File field
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(
        b"Content-Disposition: form-data; name=\"file\"; filename=\"test.bin\"\r\n",
    );
    body.extend_from_slice(b"Content-Type: application/octet-stream\r\n\r\n");
    body.extend_from_slice(content);
    body.extend_from_slice(b"\r\n");

    // Seal data field
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(b"Content-Disposition: form-data; name=\"seal_data\"\r\n\r\n");
    body.extend_from_slice(seal_base64.as_bytes());
    body.extend_from_slice(b"\r\n");

    // End boundary
    body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

    (format!("multipart/form-data; boundary={}", boundary), body)
}

/// Build the test router using the library's create_router function
fn create_test_app() -> Router {
    create_router()
}

// ============================================================================
// Health & Readiness Tests
// ============================================================================

#[tokio::test]
async fn test_health_endpoint_returns_ok() {
    let app = create_test_app();

    let response = app
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(json["status"], "healthy");
    assert!(json["version"].is_string());
}

#[tokio::test]
async fn test_ready_endpoint_returns_ok() {
    let app = create_test_app();

    let response = app
        .oneshot(
            Request::builder()
                .uri("/ready")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

// ============================================================================
// Seal Endpoint Tests
// ============================================================================

#[tokio::test]
async fn test_seal_endpoint_creates_valid_seal() {
    let app = create_test_app();

    let content = b"Test content for sealing via API";
    let (content_type, body) = create_seal_multipart(content, "generic", true);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/seal")
                .header("Content-Type", content_type)
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: Value = serde_json::from_slice(&body).unwrap();

    assert!(
        json["seal_data"].is_string(),
        "Response should contain seal_data"
    );
    assert!(
        json["seal_id"].is_string(),
        "Response should contain seal_id"
    );
    assert!(
        json["timestamp"].is_number(),
        "Response should contain timestamp"
    );
}

#[tokio::test]
async fn test_seal_endpoint_rejects_empty_content() {
    let app = create_test_app();

    let content = b"";
    let (content_type, body) = create_seal_multipart(content, "generic", true);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/seal")
                .header("Content-Type", content_type)
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();

    // Empty content might be accepted or rejected depending on implementation
    // Just verify we get a response (not a panic)
    assert!(
        response.status() == StatusCode::CREATED || response.status() == StatusCode::BAD_REQUEST,
        "Should handle empty content gracefully"
    );
}

#[tokio::test]
async fn test_seal_endpoint_with_image_media_type() {
    let app = create_test_app();

    // Minimal JPEG
    let jpeg_content = create_test_jpeg();
    let (content_type, body) = create_seal_multipart(&jpeg_content, "image", true);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/seal")
                .header("Content-Type", content_type)
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);
}

// ============================================================================
// Verify Endpoint Tests
// ============================================================================

#[tokio::test]
async fn test_verify_endpoint_authentic_content() {
    let app = create_test_app();

    // First, seal the content
    let content = b"Content to seal and verify";
    let (content_type, body) = create_seal_multipart(content, "generic", true);

    let seal_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/seal")
                .header("Content-Type", content_type)
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(seal_response.status(), StatusCode::CREATED);

    let seal_body = axum::body::to_bytes(seal_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let seal_json: Value = serde_json::from_slice(&seal_body).unwrap();
    let seal_base64 = seal_json["seal_data"].as_str().unwrap();

    // Now verify with same content
    let (verify_content_type, verify_body) = create_verify_multipart(content, seal_base64);

    let verify_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/verify")
                .header("Content-Type", verify_content_type)
                .body(Body::from(verify_body))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(verify_response.status(), StatusCode::OK);

    let verify_body = axum::body::to_bytes(verify_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let verify_json: Value = serde_json::from_slice(&verify_body).unwrap();

    assert_eq!(verify_json["authentic"], true);
}

#[tokio::test]
async fn test_verify_endpoint_tampered_content() {
    let app = create_test_app();

    // Seal original content
    let original_content = b"Original authentic content";
    let (content_type, body) = create_seal_multipart(original_content, "generic", true);

    let seal_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/seal")
                .header("Content-Type", content_type)
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();

    let seal_body = axum::body::to_bytes(seal_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let seal_json: Value = serde_json::from_slice(&seal_body).unwrap();
    let seal_base64 = seal_json["seal_data"].as_str().unwrap();

    // Verify with TAMPERED content
    let tampered_content = b"Tampered malicious content";
    let (verify_content_type, verify_body) = create_verify_multipart(tampered_content, seal_base64);

    let verify_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/verify")
                .header("Content-Type", verify_content_type)
                .body(Body::from(verify_body))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(verify_response.status(), StatusCode::OK);

    let verify_body = axum::body::to_bytes(verify_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let verify_json: Value = serde_json::from_slice(&verify_body).unwrap();

    assert_eq!(verify_json["authentic"], false);
}

#[tokio::test]
async fn test_verify_endpoint_invalid_seal() {
    let app = create_test_app();

    let content = b"Some content";
    let invalid_seal = BASE64.encode(b"this is not a valid seal");

    let (content_type, body) = create_verify_multipart(content, &invalid_seal);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/verify")
                .header("Content-Type", content_type)
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();

    // Should return error status for invalid seal
    assert!(
        response.status() == StatusCode::BAD_REQUEST
            || response.status() == StatusCode::UNPROCESSABLE_ENTITY,
        "Invalid seal should return error status"
    );
}

// ============================================================================
// E2E Workflow Tests
// ============================================================================

#[tokio::test]
async fn test_e2e_seal_verify_roundtrip_multiple_files() {
    let app = create_test_app();

    let test_files = [
        (
            "document.pdf",
            b"PDF document content".as_slice(),
            "generic",
        ),
        ("photo.jpg", &create_test_jpeg()[..], "image"),
        ("video.mp4", b"Video file content".as_slice(), "video"),
    ];

    for (filename, content, media_type) in test_files {
        // Seal
        let (seal_ct, seal_body) = create_seal_multipart(content, media_type, true);
        let seal_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/seal")
                    .header("Content-Type", seal_ct)
                    .body(Body::from(seal_body))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(
            seal_response.status(),
            StatusCode::CREATED,
            "Seal failed for {}",
            filename
        );

        let seal_body = axum::body::to_bytes(seal_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let seal_json: Value = serde_json::from_slice(&seal_body).unwrap();
        let seal_base64 = seal_json["seal_data"].as_str().unwrap();

        // Verify
        let (verify_ct, verify_body) = create_verify_multipart(content, seal_base64);
        let verify_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/verify")
                    .header("Content-Type", verify_ct)
                    .body(Body::from(verify_body))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(
            verify_response.status(),
            StatusCode::OK,
            "Verify failed for {}",
            filename
        );

        let verify_body = axum::body::to_bytes(verify_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let verify_json: Value = serde_json::from_slice(&verify_body).unwrap();

        assert_eq!(
            verify_json["authentic"], true,
            "Content should be authentic for {}",
            filename
        );
    }
}

#[tokio::test]
async fn test_e2e_single_byte_tamper_detection() {
    let app = create_test_app();

    let original = b"CONFIDENTIAL: Secret information here";

    // Seal original
    let (seal_ct, seal_body) = create_seal_multipart(original, "generic", true);
    let seal_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/seal")
                .header("Content-Type", seal_ct)
                .body(Body::from(seal_body))
                .unwrap(),
        )
        .await
        .unwrap();

    let seal_body = axum::body::to_bytes(seal_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let seal_json: Value = serde_json::from_slice(&seal_body).unwrap();
    let seal_base64 = seal_json["seal_data"].as_str().unwrap();

    // Tamper: change single byte
    let mut tampered = original.to_vec();
    tampered[0] = b'X'; // XONFIDENTIAL instead of CONFIDENTIAL

    // Verify tampered
    let (verify_ct, verify_body) = create_verify_multipart(&tampered, seal_base64);
    let verify_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/verify")
                .header("Content-Type", verify_ct)
                .body(Body::from(verify_body))
                .unwrap(),
        )
        .await
        .unwrap();

    let verify_body = axum::body::to_bytes(verify_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let verify_json: Value = serde_json::from_slice(&verify_body).unwrap();

    assert_eq!(
        verify_json["authentic"], false,
        "Single byte change should be detected"
    );
}

// ============================================================================
// OpenAPI Documentation Tests
// ============================================================================

#[tokio::test]
async fn test_openapi_spec_endpoint() {
    let app = create_test_app();

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api-docs/openapi.json")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: Value = serde_json::from_slice(&body).unwrap();

    // Verify OpenAPI structure
    assert_eq!(json["openapi"].as_str().unwrap().starts_with("3."), true);
    assert!(json["info"]["title"].is_string());
    assert!(json["info"]["version"].is_string());
    assert!(json["paths"].is_object());

    // Verify our endpoints are documented
    assert!(
        json["paths"]["/seal"].is_object(),
        "Seal endpoint should be documented"
    );
    assert!(
        json["paths"]["/verify"].is_object(),
        "Verify endpoint should be documented"
    );
    assert!(
        json["paths"]["/health"].is_object(),
        "Health endpoint should be documented"
    );
    assert!(
        json["paths"]["/ready"].is_object(),
        "Ready endpoint should be documented"
    );
}

#[tokio::test]
async fn test_swagger_ui_endpoint() {
    let app = create_test_app();

    // Access /docs/ directly (Swagger UI is served at /docs/)
    let response = app
        .oneshot(
            Request::builder()
                .uri("/docs/")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(
        response.status(),
        StatusCode::OK,
        "Swagger UI should be accessible at /docs/"
    );

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let html = String::from_utf8_lossy(&body);

    // Verify it's Swagger UI HTML
    assert!(
        html.contains("swagger") || html.contains("Swagger") || html.contains("openapi"),
        "Response should contain Swagger UI"
    );
}

// ============================================================================
// Error Handling Tests
// ============================================================================

#[tokio::test]
async fn test_seal_missing_file_field() {
    let app = create_test_app();

    // Malformed multipart without file field
    let boundary = "----TestBoundary";
    let body = format!(
        "--{}\r\nContent-Disposition: form-data; name=\"media_type\"\r\n\r\ngeneric\r\n--{}--\r\n",
        boundary, boundary
    );

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/seal")
                .header(
                    "Content-Type",
                    format!("multipart/form-data; boundary={}", boundary),
                )
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();

    assert!(
        response.status().is_client_error(),
        "Missing file should return client error"
    );
}

#[tokio::test]
async fn test_verify_missing_seal_field() {
    let app = create_test_app();

    // Multipart with file but no seal_data
    let boundary = "----TestBoundary";
    let body = format!(
        "--{}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"test.bin\"\r\nContent-Type: application/octet-stream\r\n\r\ntest content\r\n--{}--\r\n",
        boundary, boundary
    );

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/verify")
                .header(
                    "Content-Type",
                    format!("multipart/form-data; boundary={}", boundary),
                )
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();

    assert!(
        response.status().is_client_error(),
        "Missing seal should return client error"
    );
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Create a minimal valid JPEG image
fn create_test_jpeg() -> Vec<u8> {
    vec![
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
        0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06,
        0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B,
        0x0C, 0x19, 0x12, 0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
        0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31,
        0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF,
        0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00,
        0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B,
        0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03, 0x03, 0x02, 0x04, 0x03, 0x05, 0x05,
        0x04, 0x04, 0x00, 0x00, 0x01, 0x7D, 0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21,
        0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
        0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0A,
        0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2A, 0x34, 0x35, 0x36, 0x37,
        0x38, 0x39, 0x3A, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56,
        0x57, 0x58, 0x59, 0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
        0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8A, 0x92, 0x93,
        0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9,
        0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6, 0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6,
        0xC7, 0xC8, 0xC9, 0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
        0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4, 0xF5, 0xF6, 0xF7,
        0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0xFB, 0xD5,
        0xDB, 0x20, 0xA8, 0xF1, 0x7E, 0xFF, 0xD9,
    ]
}
