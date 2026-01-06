#![no_main]

//! Fuzz target for VeritasSeal::from_cbor()
//!
//! This target exercises the CBOR deserialization path to find:
//! - Panics from malformed input
//! - Memory safety issues
//! - Logic errors in validation
//!
//! Run with: cargo +nightly fuzz run fuzz_from_cbor

use libfuzzer_sys::fuzz_target;
use veritas_core::VeritasSeal;

fuzz_target!(|data: &[u8]| {
    // Attempt to deserialize arbitrary bytes as a VeritasSeal
    // This should never panic - all errors should be gracefully handled
    let _ = VeritasSeal::from_cbor(data);
});
