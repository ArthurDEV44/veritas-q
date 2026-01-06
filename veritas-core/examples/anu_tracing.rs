//! Example demonstrating ANU QRNG tracing instrumentation.
//!
//! Run with: cargo run -p veritas-core --example anu_tracing

use std::time::Duration;
use tracing_subscriber::{fmt, EnvFilter};
use veritas_core::qrng::{AnuQrng, AnuQrngConfig, QuantumEntropySource};

#[tokio::main]
async fn main() {
    // Initialize tracing subscriber with debug level
    fmt()
        .with_env_filter(EnvFilter::new("veritas_core=debug,info"))
        .with_target(true)
        .with_thread_ids(false)
        .with_file(false)
        .with_line_number(false)
        .init();

    println!("=== ANU QRNG Tracing Demo ===\n");

    let config = AnuQrngConfig {
        api_url: "https://qrng.anu.edu.au/API/jsonI.php?length=1&type=hex16&size=32".to_string(),
        timeout: Duration::from_secs(15),
        max_retries: 2,
    };

    println!("Config: {:?}\n", config);

    let qrng = match AnuQrng::with_config(config) {
        Ok(q) => q,
        Err(e) => {
            eprintln!("Failed to create client: {}", e);
            return;
        }
    };

    println!("\nFetching quantum entropy...\n");

    match qrng.get_entropy().await {
        Ok(entropy) => {
            println!("\n✅ Success!");
            println!("   Bytes: {}", entropy.len());
            println!("   Hex:   {}", hex::encode(entropy));
        }
        Err(e) => {
            println!("\n❌ Failed: {}", e);
        }
    }
}
