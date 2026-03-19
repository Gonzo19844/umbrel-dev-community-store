# PowPow Dev Store Notes

This package is now wired to the real PowPow stack.

## Current status

- Uses GHCR images published from `WillItMod/PowPow_Build`
- App image: `ghcr.io/willitmod/powpow-app:0.2.1-dev`
- Service images:
  - `ghcr.io/willitmod/powpow-litecoin:0.2.1-dev`
  - `ghcr.io/willitmod/powpow-dogecoin:0.2.1-dev`
  - `ghcr.io/willitmod/powpow-pool:0.2.1-dev`
- Runtime UI behavior is intentionally aligned to the current live host baseline at `10.10.10.235`
- Miner endpoint hint is injected through packaging with `NETWORK_HOST_HINT: "${NETWORK_IP}"`
- App version display is currently whatever the host-baseline runtime shows by default

## Packaging notes

- The stale DigiByte/Miningcore package content is ignored via `.gitignore`
- PostgreSQL schema init files are copied from `PowPow_Build/postgres/init`
- `docker-compose.yml` now represents the PowPow-native stack:
  - `app`
  - `litecoin`
  - `dogecoin`
  - `pool`
  - `postgres`

## Deployment note

This is still a DEV app. It should go to the dev store only until there is enough runtime validation on real hosts.
