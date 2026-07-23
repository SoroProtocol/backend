# SoroProtocol API

> The backend service powering SoroProtocol — real-time payment streaming on Stellar.

SoroProtocol API is a NestJS application that indexes Soroban smart contract events, exposes a versioned REST API for stream and vesting data, and delivers webhook notifications for stream lifecycle changes. It is designed to be the reliable data layer between the SoroProtocol smart contracts and any client application.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Features](#features)
- [Getting Started](#getting-started)
- [Docker](#docker)
- [API Reference](#api-reference)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Available Scripts](#available-scripts)
- [Contributing](#contributing)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [NestJS](https://nestjs.com) v10 |
| Blockchain | [@stellar/stellar-sdk](https://github.com/stellar/js-stellar-sdk) v12 — Soroban RPC & XDR |
| Authentication | JWT with Stellar keypair challenge-response |
| API Docs | Swagger / OpenAPI 3 |
| Runtime | Node.js 20+, TypeScript 5 |

---

## Features

- **Soroban Event Indexer** — polls the Soroban RPC every 5 seconds and processes `StreamCreated`, `Withdrawn`, and `Cancelled` contract events in real time
- **REST API** — versioned endpoints (`/v1`) for streams, analytics, and webhooks
- **Webhook Delivery** — subscribe any URL to stream lifecycle events; retries with exponential backoff on failure
- **Stellar Authentication** — stateless JWT auth using a cryptographic challenge signed by a Stellar keypair
- **Auto-generated Docs** — interactive Swagger UI served at `/docs`
- **Health Check** — liveness probe at `/v1/health`

---

## Getting Started

**Prerequisites:** Node.js 20+, npm 9+

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Open .env and fill in STREAM_CONTRACT_ID, SOROBAN_RPC_URL, and JWT_SECRET

# 3. Start the development server
npm run start:dev
```

The API will be available at `http://localhost:3001`.
Interactive API documentation is served at `http://localhost:3001/docs`.

---

## Docker

To run the full stack locally with Docker Compose:

```bash
docker-compose up
```

This starts the API server with all required services. Configuration is read from your `.env` file.

---

## API Reference

All routes are prefixed with `/v1`. Full interactive documentation is available at `/docs`.

### Authentication

SoroProtocol uses a challenge-response flow. Request a nonce, sign it with your Stellar keypair, and exchange the signature for a JWT bearer token.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/auth/challenge?address={G...}` | Request a sign challenge for a Stellar address |
| `POST` | `/v1/auth/verify` | Submit a signed challenge and receive a JWT |

### Streams

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/streams` | List all indexed streams; filter by `?address={G...}` |
| `GET` | `/v1/streams/analytics?address={G...}` | Aggregate stats: total, active, cancelled, combined rate |
| `GET` | `/v1/streams/:id` | Retrieve a single stream by ID |
| `POST` | `/v1/streams` | Manually index a newly created stream |
| `POST` | `/v1/streams/batch` | Index multiple streams from one sender at once (e.g. payroll), up to 100 recipients. Validates every entry before creating any of them — one bad entry rejects the whole batch and creates nothing |

**Stream statuses:** `active` · `cancelled` · `completed`

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/webhooks/subscribe` | Register a URL to receive stream event notifications |
| `DELETE` | `/v1/webhooks/:id` | Remove a webhook subscription |

**Supported events:**

| Event | Trigger |
|-------|---------|
| `stream.created` | A new stream is created on-chain |
| `stream.withdrawn` | A recipient withdraws from a stream |
| `stream.cancelled` | A stream is cancelled |
| `vesting.claimed` | A vesting claim is executed |

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3001` | Port the server listens on |
| `NODE_ENV` | No | `development` | Runtime environment (`development`, `production`, `test`) |
| `STREAM_CONTRACT_ID` | Yes | — | Soroban contract ID for the streaming contract |
| `SOROBAN_RPC_URL` | Yes | — | Soroban RPC endpoint URL (Testnet or Mainnet) |
| `JWT_SECRET` | Yes | — | Secret key used to sign and verify JWTs |
| `CORS_ORIGIN` | No | `*` | Allowed CORS origin for the API |

See [`.env.example`](./.env.example) for the complete reference.

---

## Project Structure

```
src/
├── auth/          # Stellar challenge-response authentication and JWT issuance
├── health/        # Liveness health check endpoint
├── indexer/       # Soroban RPC event poller and event processors
├── stellar/       # Shared StellarService — RPC client abstraction
├── streams/       # Stream entity, repository, CRUD routes, and analytics
└── webhooks/      # Webhook subscriptions, event dispatch, and retry logic
```

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Start the server in watch mode (hot reload) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run the compiled production build |
| `npm run test` | Run unit tests with Jest |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run lint` | Lint source files with ESLint |

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for branch conventions, commit message guidelines, and the pull request process.
