# WillItMod Dev Community Store

Development/test app store for WillItMod apps.

## Apps

### Hosted / utility apps

- **AxeBench (Dev)** (`willitmod-dev-axebench`) - `4.0.20`
- **AxeLive (Dev)** (`willitmod-dev-axelive`) - `1.4-dev`
- **AxeMIG** (`willitmod-dev-axemig`) - `0.1.17`

### Node + solo pool / mining apps

- **AxeBTC** (`willitmod-dev-btc`) - `0.7.82.4-dev`
- **AxeBCH** (`willitmod-dev-bch`) - `0.8.3-rc1-dev`
- **AxeBCH2** (`axebch2`) - `0.1.28-dev`
- **AxeBC2** (`willitmod-dev-bc2`) - `0.1.6-dev`
- **AxeDGB** (`willitmod-dev-dgb`) - `0.9.166-dev`
- **AxePPC** (`willitmod-dev-ppc`) - `0.2.30-dev`
- **AxeXEC** (`willitmod-dev-xec`) - `0.1.10-dev`
- **PowPow** (`axepowpow`) - `0.2.12-dev`

Use `umbrel-app.yml` in each app directory as the current source of truth for the store-visible version number.

For the broader cross-store version matrix and changelog pointers, see `https://github.com/WillItMod/AxeSuite/blob/main/docs/releases.md`.

## Quick setup (solo mining)

1. Install the app and let the node sync.
2. Point miners at:
   - BTC: `stratum+tcp://<host-ip>:7890`
   - BCH: `stratum+tcp://<host-ip>:4567`
   - BCH2: `stratum+tcp://<host-ip>:9265`
   - BC2: `stratum+tcp://<host-ip>:2345`
   - DGB (SHA256): `stratum+tcp://<host-ip>:5678`
   - DGB (Scrypt): `stratum+tcp://<host-ip>:5679`
   - XEC: `stratum+tcp://<host-ip>:4321`
   - PPC: `stratum+tcp://<host-ip>:8765`
   - PowPow (LTC + DOGE merged mining): `stratum+tcp://<host-ip>:9555`

Hosted / utility apps such as AxeBench, AxeLive, and AxeMIG are dashboard/UI apps rather than miner endpoints.

## Address format notes

**BCH**
Many wallets (e.g. Trust Wallet) show Bitcoin Cash addresses in CashAddr format (`q...` / `p...`).

For maximum compatibility with ckpool/miners, use a legacy BCH Base58 address (`1...` / `3...`) as the payout address. If your wallet only shows CashAddr, convert it to legacy (or enable legacy display) before saving.

**XEC**
Many wallets show eCash addresses in CashAddr format (`ecash:q...` / `ecash:p...`).

Payout address supports both legacy Base58 (`1...` / `3...`) and CashAddr (`ecash:q...` / `ecash:p...`).

**DGB**
Use a DigiByte address (typically Base58 `D...` / `S...` or Bech32 `dgb1...`).

## Security / provenance

- BCHN runs from Docker Hub image `mainnet/bitcoin-cash-node` (pinned by version tag in `docker-compose.yml`).
- ckpool (XEC) runs from `ghcr.io/willitmod/ecash-ckpool-solo` (pinned by tag in `docker-compose.yml`).
- BTC node selector runs from `ghcr.io/willitmod/axebtc-bitcoind-switch` (pinned by version tag in `docker-compose.yml`).
- BC2 node runs from `ghcr.io/willitmod/bitcoinii-core` (pinned by version tag in `docker-compose.yml`).
- XEC node is built locally from official Bitcoin ABC release tarballs (pinned by version in `data/xecd/Dockerfile`).
- PPC node runs from `ghcr.io/willitmod/peercoin-core` (pinned by version tag in `docker-compose.yml`).
- This store repo does not patch upstream source code; it only orchestrates upstream components via Docker images (some are built from official release tarballs).
