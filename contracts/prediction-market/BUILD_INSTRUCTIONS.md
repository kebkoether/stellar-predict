# Build Instructions

## Prerequisites

- Rust 1.70+ (supports `wasm32-unknown-unknown` target)
- Soroban CLI (optional, for deployment)

## Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown
```

## Build Release Binary

```bash
cd contracts/prediction-market
cargo build --release --target wasm32-unknown-unknown
```

**Output**: `target/wasm32-unknown-unknown/release/prediction_market.wasm`

**Build time**: ~30-60 seconds (first build includes dependencies)

## Verify Build

```bash
ls -lh target/wasm32-unknown-unknown/release/prediction_market.wasm
```

Expected size: ~150-200 KB

## Testing Build

```bash
# Check for compilation warnings
cargo check

# Format code
cargo fmt

# Run linter
cargo clippy
```

## Optimization

Release build already includes:
- LTO (Link Time Optimization): enabled
- Strip symbols: enabled
- Overflow checks: enabled
- Optimization level: z (minimal size)

## Install Soroban CLI (for deployment)

```bash
cargo install soroban-cli
soroban version
```

## Deploy to Testnet

```bash
# Set network
export SOROBAN_NETWORK_URL=https://soroban-testnet.stellar.org

# Deploy
soroban contract deploy \
  --source your_account \
  target/wasm32-unknown-unknown/release/prediction_market.wasm

# Output will be the Contract ID
```

## Initialize Contract

```bash
soroban contract invoke \
  --id CONTRACT_ID \
  -- initialize \
  --admin YOUR_ADMIN_ADDRESS
```

## Common Build Issues

### "rustup: command not found"
Install Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

### "cannot find wasm32 target"
Add target: `rustup target add wasm32-unknown-unknown`

### "too many open files" (macOS)
Increase limit: `ulimit -n 4096`

### "version requirements don't match"
Update dependencies: `cargo update`

## Troubleshooting

If build fails:
1. Clean build cache: `cargo clean`
2. Update dependencies: `cargo update`
3. Check Rust version: `rustc --version`
4. Try verbose output: `cargo build -vv`

## Size Optimization

Current binary is already optimized. To further reduce:
- Remove unused modules (currently all are used)
- Reduce error message strings
- Use shorter variable names (not recommended for readability)

## Documentation Build

```bash
cargo doc --no-deps --open
```

Opens documentation in your browser.

## Next Steps

1. Build: `cargo build --release --target wasm32-unknown-unknown`
2. Test: Run local tests (see EXAMPLES.md)
3. Deploy: Push to testnet
4. Monitor: Track market lifecycle
5. Scale: Deploy to mainnet
