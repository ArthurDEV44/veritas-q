# Plan: Fix Perceptual Hash Size Inconsistency

## Problem

The `/resolve` endpoint fails with:
```
"Perceptual hash must be 8 bytes, got 5"
```

### Root Cause

| Component | Hash Size | Expected |
|-----------|-----------|----------|
| `compute_phash()` output | 5 bytes (40 bits) | 8 bytes (64 bits) |
| `/resolve` validation | - | 8 bytes |
| C2PA manifest stored | `71a32c3053` (5 bytes) | - |

The `image_hasher` crate with `DoubleGradient` algorithm produces variable-size hashes depending on image content.

## Files Involved

| File | Role |
|------|------|
| `veritas-core/src/watermark/perceptual.rs` | `PerceptualHasher`, `compute_phash()` |
| `veritas-server/src/handlers/resolve.rs` | `/resolve` endpoint validation (line 156) |
| `veritas-core/src/seal.rs` | Seal creation with perceptual hash |

## Research Tasks

### 1. Investigate `image_hasher` Behavior
- [ ] Check `image_hasher` crate documentation for hash size guarantees
- [ ] Test different `HashAlg` variants (Mean, Gradient, DoubleGradient, Blockhash)
- [ ] Determine if `hash_size` parameter affects output size consistently
- [ ] Check GitHub issues for similar problems

### 2. Evaluate Alternative Libraries
- [ ] Research `img_hash` crate
- [ ] Research `blockhash` crate
- [ ] Compare performance and hash size consistency
- [ ] Check C2PA ecosystem recommendations for perceptual hashing

### 3. Industry Standards Research
- [ ] What hash size does C2PA recommend for soft binding?
- [ ] What do other media authentication systems use?
- [ ] pHash standard specifications

## Potential Solutions

### Option A: Force 8-byte Output
```rust
// Pad or truncate hash to exactly 8 bytes
fn normalize_hash(hash: Vec<u8>) -> [u8; 8] {
    let mut result = [0u8; 8];
    let len = hash.len().min(8);
    result[..len].copy_from_slice(&hash[..len]);
    result
}
```
**Pros:** Minimal changes, backward compatible for comparison
**Cons:** May lose hash information if truncating

### Option B: Variable-Length Hash Support
```rust
// Remove fixed-size validation in /resolve
if phash_bytes.is_empty() {
    return Err(ApiError::bad_request("Perceptual hash cannot be empty"));
}
// Allow any non-empty hash, compare with same-size hashes only
```
**Pros:** Flexible, works with any algorithm
**Cons:** Need to handle mixed-size comparisons in DB queries

### Option C: Change Hash Algorithm
```rust
// Use Blockhash which has consistent 16-byte output
impl Default for PerceptualHasher {
    fn default() -> Self {
        Self {
            algorithm: HashAlgorithm::Blockhash,
            hash_size: 16, // 16x16 = 256 bits = 32 bytes
        }
    }
}
```
**Pros:** Consistent output size
**Cons:** Breaking change for existing seals, migration needed

### Option D: Use Different Library
Replace `image_hasher` with a more predictable library.

## Testing Plan

1. Unit tests for hash size consistency across different images
2. Integration test for `/resolve` with computed vs stored hashes
3. Test with various image formats (JPEG, PNG, WebP)
4. Test with different image sizes and content

## Migration Considerations

- Existing seals have 5-byte hashes stored
- Need backward compatibility or migration script
- Database schema may need adjustment

## Commands for Research

```bash
# Check image_hasher behavior
cargo doc -p image-hasher --open

# Test hash sizes with different algorithms
cargo test -p veritas-core perceptual -- --nocapture

# Check what other Rust projects use
# Search GitHub for "perceptual hash rust 8 bytes"
```

## Web Research URLs

- https://crates.io/crates/image_hasher
- https://github.com/image-rs/image-hasher
- https://c2pa.org/specifications/ (soft binding specs)
- https://www.phash.org/

## Decision Criteria

1. **Consistency**: Hash size must be predictable
2. **Robustness**: Hash must survive JPEG compression, resizing
3. **Performance**: < 50ms per hash computation
4. **Compatibility**: Work with existing C2PA ecosystem
5. **Migration**: Minimize impact on existing seals

---

**Priority:** Medium (feature works, just /resolve is broken)
**Estimated effort:** 2-4 hours research + implementation
