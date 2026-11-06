#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .local
process_alive() {
  [[ "$1" =~ ^[0-9]+$ ]] || return 1
  local runtime_stat
  runtime_stat="$(ps -o stat= -p "$1" 2>/dev/null || true)"
  runtime_stat="${runtime_stat//[[:space:]]/}"
  [[ -n "$runtime_stat" && "$runtime_stat" != Z* ]]
}
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
  if [[ "${CONTROL_TOWER_WEB_MODE:-development}" == "production" ]]; then
    nohup npm start >.local/app.log 2>&1 &
  else
    nohup npm run dev >.local/app.log 2>&1 &
  fi
  echo "$!" >.local/app.pid
fi
if ! test -f .local/worker.pid || ! process_alive "$(cat .local/worker.pid)"; then
  nohup npm run worker >.local/worker.log 2>&1 &
  echo "$!" >.local/worker.pid
fi
for _ in $(seq 1 60); do
  if curl --fail --silent http://localhost:3000/api/health; then
    echo
    echo 'Control Tower is ready. Sign in using Explore the demo. Logs: .local/app.log and .local/worker.log'
    if [[ "${1:-}" == "--stay-alive" ]]; then
      echo 'Foreground supervisor active. Keep this command running while using the workspace.'
      trap 'exit 0' INT TERM
      while true; do
        sleep 5
        if ! db_ready || ! process_alive "$(cat .local/app.pid)" || ! process_alive "$(cat .local/worker.pid)"; then
          echo 'A supervised service stopped. Read .local logs and restart the supervisor.'
          exit 1
        fi
      done
    fi
    exit 0
  fi
  sleep 1
done
echo 'Application failed readiness. Read .local/app.log.'
exit 1
