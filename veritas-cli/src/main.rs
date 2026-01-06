//! Veritas CLI - Quantum-authenticated media sealing tool.

use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand, ValueEnum};
use tracing::Level;
use tracing_subscriber::EnvFilter;

mod commands;
mod exit_codes;
mod utils;

/// Output format for seal files.
#[derive(Clone, Copy, Debug, Default, ValueEnum)]
pub enum OutputFormat {
    /// CBOR binary format (compact, recommended)
    #[default]
    Cbor,
    /// JSON text format (human-readable)
    Json,
}

/// Color output mode.
#[derive(Clone, Copy, Default, ValueEnum)]
pub enum ColorMode {
    /// Auto-detect based on terminal
    #[default]
    Auto,
    /// Always use colors
    Always,
    /// Never use colors
    Never,
}

#[derive(Parser)]
#[command(name = "veritas")]
#[command(author, version, about = "Quantum-authenticated media sealing", long_about = None)]
#[command(after_help = "Examples:
  veritas seal image.jpg              Seal a file with quantum entropy
  veritas seal --mock image.jpg       Seal with mock entropy (testing)
  veritas verify image.jpg            Verify a sealed file
  veritas anchor image.jpg.veritas    Anchor seal to Solana

Exit codes:
  0   Success
  1   General error
  64  Usage error (invalid arguments)
  65  Verification failed (tampered content)
  66  Input error (file not found)
  69  Network error (QRNG/blockchain unavailable)
  74  I/O error (cannot write output)")]
struct Cli {
    /// Increase verbosity (-v, -vv, -vvv)
    #[arg(short, long, action = clap::ArgAction::Count, global = true)]
    verbose: u8,

    /// Suppress non-essential output
    #[arg(short, long, global = true, conflicts_with = "verbose")]
    quiet: bool,

    /// Color output mode
    #[arg(long, global = true, default_value = "auto", value_enum)]
    color: ColorMode,

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
        #[arg(short, long, default_value = "cbor", value_enum)]
        format: OutputFormat,

        /// Use mock QRNG instead of real quantum entropy (for testing)
        #[arg(long)]
        r#mock: bool,

        /// Path to existing ML-DSA-65 keypair file to use for signing
        #[arg(long, value_name = "PATH")]
        keypair: Option<PathBuf>,

        /// Save the generated keypair to this path (ignored if --keypair is set)
        #[arg(long, value_name = "PATH")]
        save_keypair: Option<PathBuf>,

        /// Show what would be done without actually creating the seal
        #[arg(short = 'n', long)]
        dry_run: bool,
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

        /// Show what would be done without sending the transaction
        #[arg(short = 'n', long)]
        dry_run: bool,
    },
}

fn setup_logging(verbose: u8, quiet: bool, color: ColorMode) {
    let level = if quiet {
        Level::ERROR
    } else {
        match verbose {
            0 => Level::WARN,
            1 => Level::INFO,
            2 => Level::DEBUG,
            _ => Level::TRACE,
        }
    };

    let filter = EnvFilter::builder()
        .with_default_directive(level.into())
        .from_env_lossy();

    let use_ansi = match color {
        ColorMode::Always => true,
        ColorMode::Never => false,
        ColorMode::Auto => std::io::IsTerminal::is_terminal(&std::io::stderr()),
    };

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .without_time()
        .with_ansi(use_ansi)
        .init();
}

fn setup_color(mode: ColorMode) {
    match mode {
        ColorMode::Auto => {} // colored crate auto-detects by default
        ColorMode::Always => colored::control::set_override(true),
        ColorMode::Never => colored::control::set_override(false),
    }
}

#[tokio::main]
async fn main() -> ExitCode {
    let cli = Cli::parse();

    setup_color(cli.color);
    setup_logging(cli.verbose, cli.quiet, cli.color);

    let result = match cli.command {
        Commands::Seal {
            file,
            format,
            r#mock,
            keypair,
            save_keypair,
            dry_run,
        } => {
            commands::seal::execute(
                file,
                format,
                r#mock,
                keypair,
                save_keypair,
                dry_run,
                cli.quiet,
            )
            .await
        }
        Commands::Verify { file, seal } => commands::verify::execute(file, seal, cli.quiet).await,
        Commands::Anchor {
            seal,
            update_seal,
            dry_run,
        } => commands::anchor::execute(seal, update_seal, dry_run, cli.quiet).await,
    };

    match result {
        Ok(()) => ExitCode::from(exit_codes::SUCCESS as u8),
        Err(e) => {
            let exit = exit_codes::ExitCode::from_anyhow(&e);
            if !cli.quiet {
                eprintln!("Error: {:#}", e);
            }
            ExitCode::from(exit.code as u8)
        }
    }
}
