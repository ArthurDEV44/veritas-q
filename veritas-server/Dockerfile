# =============================================================================
# Veritas Server Dockerfile - Multi-stage build for minimal image size
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build environment
# -----------------------------------------------------------------------------
FROM rust:1.92-bookworm AS builder

# Install build dependencies (clang for post-quantum crypto)
RUN apt-get update && apt-get install -y \
    clang \
    libclang-dev \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace files
COPY Cargo.toml Cargo.lock ./
COPY veritas-core ./veritas-core
COPY veritas-server ./veritas-server
COPY veritas-cli ./veritas-cli
COPY veritas-wasm ./veritas-wasm

# Build release binary
RUN cargo build --release -p veritas-server

# -----------------------------------------------------------------------------
# Stage 2: Runtime environment (minimal)
# -----------------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN useradd -m -u 1000 veritas
USER veritas

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/target/release/veritas-server /app/veritas-server

# Expose port (Render uses PORT env var)
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-10000}/health || exit 1

# Run the server
ENV HOST=0.0.0.0
ENV PORT=10000
CMD ["/app/veritas-server"]
