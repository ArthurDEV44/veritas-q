//! Exit codes following sysexits.h conventions.
//!
//! These codes provide semantic meaning for different failure modes,
//! enabling scripts and CI systems to handle errors appropriately.

#![allow(dead_code)] // Constants may be used in future or for documentation

/// Successful execution.
pub const SUCCESS: i32 = 0;

/// General error (catch-all).
pub const GENERAL_ERROR: i32 = 1;

/// Command line usage error (invalid arguments).
/// Maps to EX_USAGE from sysexits.h.
pub const USAGE_ERROR: i32 = 64;

/// Data format error (verification failed, tampered content).
/// Maps to EX_DATAERR from sysexits.h.
pub const VERIFICATION_FAILED: i32 = 65;

/// Cannot open input file.
/// Maps to EX_NOINPUT from sysexits.h.
pub const INPUT_ERROR: i32 = 66;

/// Service unavailable (network, QRNG, blockchain).
/// Maps to EX_UNAVAILABLE from sysexits.h.
pub const NETWORK_ERROR: i32 = 69;

/// I/O error (cannot write output file).
/// Maps to EX_IOERR from sysexits.h.
pub const IO_ERROR: i32 = 74;

/// Represents an exit code with optional error context.
pub struct ExitCode {
    pub code: i32,
    pub message: Option<String>,
}

impl ExitCode {
    pub const fn success() -> Self {
        Self {
            code: SUCCESS,
            message: None,
        }
    }

    pub fn error(code: i32, message: impl Into<String>) -> Self {
        Self {
            code,
            message: Some(message.into()),
        }
    }

    pub fn from_anyhow(err: &anyhow::Error) -> Self {
        let message = format!("{err:#}");

        // Classify error by inspecting the chain
        let code =
            if message.contains("Failed to read file") || message.contains("Failed to read seal") {
                INPUT_ERROR
            } else if message.contains("verification failed")
                || message.contains("has been modified")
                || message.contains("TAMPERED")
            {
                VERIFICATION_FAILED
            } else if message.contains("QRNG")
                || message.contains("network")
                || message.contains("Solana")
                || message.contains("airdrop")
            {
                NETWORK_ERROR
            } else if message.contains("Failed to write") || message.contains("serialize") {
                IO_ERROR
            } else {
                GENERAL_ERROR
            };

        Self {
            code,
            message: Some(message),
        }
    }
}
