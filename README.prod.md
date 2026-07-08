# Production readiness notes

## Current storage model

- The app now uses PostgreSQL through the DATABASE_URL environment variable.
- Production data is stored in the external PostgreSQL service, so it persists across Render deploys and app restarts.

## Why data disappears after deploy

- SQLite data stored inside the container filesystem is not durable across rebuilds.
- PostgreSQL avoids that problem by keeping data in a managed database service.

## Render environment variables

- NODE_ENV=production
- JWT_SECRET=...
- DATABASE_URL=postgres://...

## Initialize tables

- Run `npm run db:init` once after setting DATABASE_URL.

## Migrate existing SQLite data

- If you still have an existing SQLite file, run `npm run db:migrate` after setting SQLITE_DB_PATH if needed.
