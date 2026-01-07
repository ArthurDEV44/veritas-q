//! Soft binding module for image robustness.
//!
//! This module provides mechanisms for binding seals to image content in a way
//! that survives common transformations like compression, resizing, and cropping.
//!
//! # Components
//!
//! - **Perceptual hashing**: Creates fingerprints that remain similar for visually
//!   similar images, enabling verification even after re-encoding.
//!
//! # Future Extensions
//!
//! - **Steganography**: Invisible watermarks embedded in pixel data (planned)
//! - **Robust hashing**: Additional algorithms for specific use cases

pub mod perceptual;

pub use perceptual::*;
