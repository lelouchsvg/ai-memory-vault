#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .local
db_ready() {
  test -f .env.local && node --env-file=.env.local --input-type=module -e 'import pg from "pg"; const p=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:2000});try{await p.query("SELECT 1");await p.end();}catch{await p.end();process.exit(1);}' >/dev/null 2>&1
}
if ! db_ready; then
  nohup npm run db:start >.local/database.log 2>&1 &
  echo "$!" >.local/database.pid
  for _ in $(seq 1 40); do if db_ready; then break; fi; sleep 0.5; done
  if ! db_ready; then echo 'Database failed to start. Read .local/database.log'; exit 1; fi
fi
npm run db:migrate
npm run db:seed
npm run owner:create -- --demo
if ! curl --fail --silent http://localhost:3000/api/health >/dev/null; then
  nohup npm run dev >.local/app.log 2>&1 &
  echo "$!" >.local/app.pid
fi
if ! test -f .local/worker.pid || ! kill -0 "$(cat .local/worker.pid)" 2>/dev/null; then
  nohup npm run worker >.local/worker.log 2>&1 &
  echo "$!" >.local/worker.pid
fi
for _ in $(seq 1 60); do
  if curl --fail --silent http://localhost:3000/api/health; then
    echo
    echo 'Control Tower is ready. Sign in using Explore the demo. Logs: .local/app.log and .local/worker.log'
    exit 0
  fi
  sleep 1
done
echo 'Application failed readiness. Read .local/app.log.'
exit 1
