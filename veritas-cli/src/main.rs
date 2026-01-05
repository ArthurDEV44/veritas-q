//! Veritas CLI - Quantum-authenticated media sealing tool.

use std::path::PathBuf;

use anyhow::Result;
use clap::{Parser, Subcommand};

mod commands;

#[derive(Parser)]
#[command(name = "veritas")]
#[command(author, version, about = "Quantum-authenticated media sealing", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Seal a file with quantum entropy and post-quantum signature
    Seal {
        /// Path to the file to seal
        #[arg(value_name = "FILE")]
        file: PathBuf,

        /// Output format for the seal file
        #[arg(short, long, default_value = "cbor")]
        format: String,

        /// Use mock QRNG instead of real quantum entropy (for testing)
        #[arg(long)]
        mock: bool,
    },

    /// Verify a sealed file's authenticity
    Verify {
        /// Path to the original file
        #[arg(value_name = "FILE")]
        file: PathBuf,

        /// Path to the seal file (defaults to <FILE>.veritas)
        #[arg(value_name = "SEAL")]
        seal: Option<PathBuf>,
    },

    /// Anchor a seal's hash to the Solana blockchain (Devnet)
    Anchor {
        /// Path to the seal file (.veritas)
        #[arg(value_name = "SEAL")]
        seal: PathBuf,

        /// Update the seal file with the transaction ID
        #[arg(long)]
        update_seal: bool,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Seal { file, format, mock } => {
            commands::seal::execute(file, format, mock).await
        }
        Commands::Verify { file, seal } => commands::verify::execute(file, seal).await,
        Commands::Anchor { seal, update_seal } => {
            commands::anchor::execute(seal, update_seal).await
        }
    }
}
