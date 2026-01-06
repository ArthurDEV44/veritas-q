//! Anchor command - publish seal hash to Solana blockchain.

use std::path::PathBuf;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use colored::Colorize;
use solana_client::rpc_client::RpcClient;
#[allow(deprecated)]
use solana_sdk::system_instruction;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    message::Message,
    native_token::LAMPORTS_PER_SOL,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use spl_memo::build_memo;
use tracing::{debug, info, warn};
use veritas_core::VeritasSeal;

use crate::utils::load_seal;

/// Solana Devnet RPC endpoint.
const DEVNET_RPC_URL: &str = "https://api.devnet.solana.com";

/// Airdrop amount in SOL.
const AIRDROP_SOL: u64 = 1;

/// Maximum retries for airdrop.
const AIRDROP_RETRIES: u32 = 3;

/// Execute the anchor command.
pub async fn execute(
    seal_path: PathBuf,
    update_seal: bool,
    dry_run: bool,
    quiet: bool,
) -> Result<()> {
    // Load and parse the seal
    info!(path = %seal_path.display(), "Loading seal");
    let seal = load_seal(&seal_path)?;

    // Compute the seal hash (hash of the content hash + signature prefix)
    let seal_hash = compute_seal_hash(&seal);
    info!(hash = %&seal_hash[..16], "Computed seal hash");

    // Dry run: show what would be done and exit
    if dry_run {
        let memo_text = format!("VERITAS-Q:{}", seal_hash);
        println!("{}", "[DRY RUN] Would perform the following:".cyan().bold());
        println!();
        println!("   {} {}", "Seal file:".dimmed(), seal_path.display());
        println!("   {} {}", "Seal hash:".dimmed(), &seal_hash[..16]);
        println!("   {} Solana Devnet", "Network:".dimmed());
        println!("   {} {}", "RPC URL:".dimmed(), DEVNET_RPC_URL);
        println!("   {} {} SOL", "Airdrop:".dimmed(), AIRDROP_SOL);
        println!("   {} {}", "Memo:".dimmed(), memo_text);
        println!(
            "   {} {}",
            "Update seal:".dimmed(),
            if update_seal { "yes" } else { "no" }
        );
        return Ok(());
    }

    // Generate a burner keypair
    let payer = Keypair::new();
    debug!(pubkey = %payer.pubkey(), "Generated burner keypair");

    // Connect to Devnet
    info!(url = DEVNET_RPC_URL, "Connecting to Solana Devnet");
    let client = RpcClient::new_with_timeout_and_commitment(
        DEVNET_RPC_URL.to_string(),
        Duration::from_secs(30),
        CommitmentConfig::confirmed(),
    );

    // Request airdrop
    info!(amount = AIRDROP_SOL, "Requesting SOL airdrop");
    request_airdrop_with_retry(&client, &payer.pubkey(), AIRDROP_SOL).await?;

    // Wait for airdrop to confirm
    debug!("Waiting for airdrop confirmation");
    wait_for_balance(&client, &payer.pubkey(), AIRDROP_SOL * LAMPORTS_PER_SOL).await?;

    // Build the memo instruction
    let memo_text = format!("VERITAS-Q:{}", seal_hash);
    let memo_ix = build_memo(memo_text.as_bytes(), &[&payer.pubkey()]);

    // Build a minimal transfer instruction (0 SOL to self, just to carry the memo)
    let transfer_ix = system_instruction::transfer(&payer.pubkey(), &payer.pubkey(), 0);

    // Build and send the transaction
    info!("Sending transaction");
    let recent_blockhash = client
        .get_latest_blockhash()
        .context("Failed to get recent blockhash")?;

    let message = Message::new(&[transfer_ix, memo_ix], Some(&payer.pubkey()));
    let transaction = Transaction::new(&[&payer], message, recent_blockhash);

    let signature = client
        .send_and_confirm_transaction(&transaction)
        .context("Failed to send transaction")?;

    let tx_id = signature.to_string();
    let explorer_url = format!("https://explorer.solana.com/tx/{}?cluster=devnet", tx_id);

    info!(tx_id = %tx_id, "Transaction confirmed");

    // Success output
    if !quiet {
        println!();
        println!("{}", "Anchored to Solana Devnet!".green().bold());
        println!();
        println!("   {} {}", "Transaction:".dimmed(), tx_id);
        println!("   {} {}", "Explorer:".dimmed(), explorer_url.cyan());
        println!("   {} {}", "Memo:".dimmed(), memo_text);
    }

    // Optionally update the seal file
    if update_seal {
        update_seal_with_anchor(&seal_path, &seal, &tx_id)?;
        info!(path = %seal_path.display(), "Updated seal with blockchain anchor");
        if !quiet {
            println!();
            println!("{}", "Updated seal file with blockchain anchor".green());
        }
    }

    Ok(())
}

/// Compute a hash representing the seal (content hash + first 8 bytes of signature).
fn compute_seal_hash(seal: &VeritasSeal) -> String {
    use sha3::{Digest, Sha3_256};

    let mut hasher = Sha3_256::new();
    hasher.update(seal.content_hash.crypto_hash);
    hasher.update(&seal.signature[..std::cmp::min(seal.signature.len(), 32)]);
    let result = hasher.finalize();

    hex::encode(&result[..16]) // 128-bit hash as hex
}

/// Request airdrop with retries.
async fn request_airdrop_with_retry(
    client: &RpcClient,
    pubkey: &Pubkey,
    sol_amount: u64,
) -> Result<()> {
    let lamports = sol_amount * LAMPORTS_PER_SOL;

    for attempt in 1..=AIRDROP_RETRIES {
        match client.request_airdrop(pubkey, lamports) {
            Ok(sig) => {
                debug!(attempt, signature = %sig, "Airdrop requested");
                return Ok(());
            }
            Err(e) => {
                if attempt == AIRDROP_RETRIES {
                    bail!("Airdrop failed after {} attempts: {}", AIRDROP_RETRIES, e);
                }
                warn!(attempt, error = %e, "Airdrop attempt failed, retrying");
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    }

    unreachable!()
}

/// Wait for the account to have at least the specified balance.
async fn wait_for_balance(client: &RpcClient, pubkey: &Pubkey, min_lamports: u64) -> Result<()> {
    for _ in 0..30 {
        match client.get_balance(pubkey) {
            Ok(balance) if balance >= min_lamports => {
                debug!(
                    balance_sol = balance as f64 / LAMPORTS_PER_SOL as f64,
                    "Balance confirmed"
                );
                return Ok(());
            }
            _ => {
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        }
    }

    bail!("Timeout waiting for airdrop to confirm")
}

/// Update the seal file with the blockchain anchor.
fn update_seal_with_anchor(seal_path: &PathBuf, seal: &VeritasSeal, tx_id: &str) -> Result<()> {
    use veritas_core::BlockchainAnchor;

    // Create updated seal with anchor
    let mut updated_seal = seal.clone();
    updated_seal.blockchain_anchor = Some(BlockchainAnchor {
        chain: "solana-devnet".to_string(),
        tx_id: tx_id.to_string(),
        block_height: 0, // We don't fetch this for simplicity
    });

    // Determine format and save
    let seal_bytes = std::fs::read(seal_path)?;
    if VeritasSeal::from_cbor(&seal_bytes).is_ok() {
        // CBOR format
        let cbor = updated_seal.to_cbor()?;
        std::fs::write(seal_path, cbor)?;
        debug!(format = "cbor", "Saved updated seal");
    } else {
        // JSON format
        let json = serde_json::to_string_pretty(&updated_seal)?;
        std::fs::write(seal_path, json)?;
        debug!(format = "json", "Saved updated seal");
    }

    Ok(())
}
