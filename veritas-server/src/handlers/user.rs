//! User synchronization handlers
//!
//! Handles user profile synchronization from Clerk authentication.

use axum::{extract::State, http::HeaderMap, Json};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::db::{CreateUser, UserResponse};
use crate::error::ApiError;
use crate::handlers::AppState;

/// Request for syncing user from Clerk
#[derive(Debug, Deserialize, ToSchema)]
pub struct SyncUserRequest {
    /// Clerk user ID
    #[schema(example = "user_2abc123def456")]
    pub clerk_user_id: String,
    /// User email
    #[schema(example = "user@example.com")]
    pub email: String,
    /// User display name
    #[serde(default)]
    #[schema(example = "John Doe")]
    pub name: Option<String>,
    /// User avatar URL
    #[serde(default)]
    #[schema(example = "https://img.clerk.com/...")]
    pub avatar_url: Option<String>,
}

/// Response for user sync
#[derive(Debug, Serialize, ToSchema)]
pub struct SyncUserResponse {
    /// Whether a new user was created (vs updated)
    pub created: bool,
    /// The user data
    pub user: UserResponse,
}

/// Sync user from Clerk authentication
///
/// This endpoint is called from the frontend after Clerk authentication
/// to ensure the user exists in our database. Uses upsert semantics:
/// - Creates user if not exists
/// - Updates profile if user exists
///
/// Requires valid Clerk session token in Authorization header.
#[utoipa::path(
    post,
    path = "/api/v1/users/sync",
    tag = "Users",
    request_body = SyncUserRequest,
    responses(
        (status = 200, description = "User synced successfully", body = SyncUserResponse),
        (status = 401, description = "Unauthorized - missing or invalid auth"),
        (status = 503, description = "Database not available")
    ),
    security(
        ("clerk_token" = [])
    )
)]
pub async fn sync_user_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<SyncUserRequest>,
) -> Result<Json<SyncUserResponse>, ApiError> {
    // Validate authorization header exists
    // Note: Full Clerk token validation should be done in middleware
    // This is a basic check to ensure the request has auth
    let _auth = headers
        .get("authorization")
        .ok_or_else(|| ApiError::unauthorized("Missing authorization header"))?;

    // Get user repository
    let user_repo = state
        .user_repo
        .as_ref()
        .ok_or_else(|| ApiError::service_unavailable("Database not configured"))?;

    // Check if user already exists
    let existing = user_repo
        .find_by_clerk_id(&request.clerk_user_id)
        .await
        .map_err(|e| ApiError::internal(format!("Database error: {}", e)))?;

    let created = existing.is_none();

    // Create or update user
    let user = user_repo
        .create_or_update(CreateUser {
            clerk_user_id: request.clerk_user_id,
            email: request.email,
            name: request.name,
            avatar_url: request.avatar_url,
        })
        .await
        .map_err(|e| ApiError::internal(format!("Failed to sync user: {}", e)))?;

    Ok(Json(SyncUserResponse {
        created,
        user: UserResponse::from(user),
    }))
}

/// Response for current user
#[derive(Debug, Serialize, ToSchema)]
pub struct CurrentUserResponse {
    /// The current user data
    pub user: UserResponse,
}

/// Response for delete user
#[derive(Debug, Serialize, ToSchema)]
pub struct DeleteUserResponse {
    /// Whether the deletion was successful
    pub success: bool,
    /// Message describing the result
    pub message: String,
}

/// Get current user profile
///
/// Returns the profile of the currently authenticated user.
#[utoipa::path(
    get,
    path = "/api/v1/users/me",
    tag = "Users",
    responses(
        (status = 200, description = "Current user profile", body = CurrentUserResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "User not found in database"),
        (status = 503, description = "Database not available")
    ),
    security(
        ("clerk_token" = [])
    )
)]
pub async fn get_current_user_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<CurrentUserResponse>, ApiError> {
    // Get clerk_user_id from header (set by auth middleware)
    let clerk_user_id = headers
        .get("x-clerk-user-id")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| ApiError::unauthorized("Missing x-clerk-user-id header"))?;

    // Get user repository
    let user_repo = state
        .user_repo
        .as_ref()
        .ok_or_else(|| ApiError::service_unavailable("Database not configured"))?;

    // Find user
    let user = user_repo
        .find_by_clerk_id(clerk_user_id)
        .await
        .map_err(|e| ApiError::internal(format!("Database error: {}", e)))?
        .ok_or_else(|| ApiError::not_found("User not found"))?;

    Ok(Json(CurrentUserResponse {
        user: UserResponse::from(user),
    }))
}

/// Delete current user account (GDPR right to erasure)
///
/// Performs a soft delete of the user account. The user's personal data
/// is marked for deletion, but cryptographic hashes (seals) are preserved
/// for blockchain integrity as per FR44.
///
/// This endpoint should be called after the user has been deleted from Clerk.
#[utoipa::path(
    delete,
    path = "/api/v1/users/me",
    tag = "Users",
    responses(
        (status = 200, description = "User deleted successfully", body = DeleteUserResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "User not found in database"),
        (status = 503, description = "Database not available")
    ),
    security(
        ("clerk_token" = [])
    )
)]
pub async fn delete_user_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<DeleteUserResponse>, ApiError> {
    // Get clerk_user_id from header (set by auth middleware)
    let clerk_user_id = headers
        .get("x-clerk-user-id")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| ApiError::unauthorized("Missing x-clerk-user-id header"))?;

    // Get user repository
    let user_repo = state
        .user_repo
        .as_ref()
        .ok_or_else(|| ApiError::service_unavailable("Database not configured"))?;

    // Find user first to get their internal ID
    let user = user_repo
        .find_by_clerk_id(clerk_user_id)
        .await
        .map_err(|e| ApiError::internal(format!("Database error: {}", e)))?
        .ok_or_else(|| ApiError::not_found("User not found"))?;

    // Soft delete the user
    let deleted = user_repo
        .soft_delete(user.id)
        .await
        .map_err(|e| ApiError::internal(format!("Failed to delete user: {}", e)))?;

    if deleted {
        tracing::info!(
            user_id = %user.id,
            clerk_user_id = %clerk_user_id,
            "User account soft deleted (GDPR)"
        );

        Ok(Json(DeleteUserResponse {
            success: true,
            message: "Account deleted successfully. Cryptographic seals are preserved for verification integrity.".to_string(),
        }))
    } else {
        Err(ApiError::internal("Failed to delete user"))
    }
}
