# MediFlow

MediFlow contains a React web app, Expo mobile app, shared front-end logic, and a Node.js/Express API backed by PostgreSQL.

- `frontend/` — web and mobile clients, connected to the API for patient/staff workflows.
- `backend/` — API, database migrations, provider adapters, and staff administration CLI.

Local development uses PostgreSQL and mock/console provider adapters. It is not a production deployment; see [backend/ARCHITECTURE.md](backend/ARCHITECTURE.md) and [frontend/API_INTEGRATION.md](frontend/API_INTEGRATION.md) for setup and current integration limits.

## Frontend commands

Run these from the repository root:

```sh
npm run install:frontend
npm run web
npm run mobile
npm run typecheck
npm run build:web
```

For frontend-specific setup and architecture, see [frontend/README.md](frontend/README.md). Backend planning starts in [backend/README.md](backend/README.md).
