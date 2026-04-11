# SoroProtocol API

NestJS backend service providing a REST API and Stellar event indexer for SoroProtocol.

## Features

- REST API for querying stream and vesting data
- Real-time Stellar event indexer (polls Soroban RPC)
- Webhook delivery with exponential backoff retry
- Stellar address-based JWT authentication
- Swagger docs at `/docs`
- Health check at `/v1/health`

## Getting Started

```bash
npm install
cp .env.example .env
# Fill in contract IDs and secrets
npm run start:dev
```

API docs: [http://localhost:3001/docs](http://localhost:3001/docs)

## Docker

```bash
docker-compose up
```

## Environment Variables

See `.env.example` for all configuration options.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
