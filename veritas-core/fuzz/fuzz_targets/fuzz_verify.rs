#![no_main]

//! Fuzz target for VeritasSeal verification
//!
//! This target exercises the verification path with potentially malformed seals.
//! It creates seals from arbitrary CBOR data and attempts verification.
//!
//! Run with: cargo +nightly fuzz run fuzz_verify

use libfuzzer_sys::fuzz_target;
use veritas_core::VeritasSeal;

fuzz_target!(|data: &[u8]| {
    // Try to deserialize and verify
    if let Ok(seal) = VeritasSeal::from_cbor(data) {
        // If we got a valid seal structure, try verification
        // This should never panic even with garbage data
        let _ = seal.verify();
        let _ = seal.verify_detailed();
    }
});
