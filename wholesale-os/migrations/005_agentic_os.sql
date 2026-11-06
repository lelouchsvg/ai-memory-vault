CREATE TABLE IF NOT EXISTS os_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 mode text NOT NULL CHECK(mode IN ('DEMO','LIVE')),
 actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,mode,actor_id)
);
CREATE TABLE IF NOT EXISTS os_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 mode text NOT NULL CHECK(mode IN ('DEMO','LIVE')),
 actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 session_id uuid NOT NULL,
 prompt text NOT NULL,
 skill_id text,
 property_id uuid,
 status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','RUNNING','COMPLETED','BLOCKED','FAILED','CANCELLED')),
 plan jsonb, result jsonb, error jsonb,
 cancel_requested boolean NOT NULL DEFAULT false,
 attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 3,
 run_after timestamptz NOT NULL DEFAULT now(), lease_token uuid, leased_at timestamptz,
 idempotency_key text, request_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, completed_at timestamptz,
 FOREIGN KEY(session_id,mode,actor_id) REFERENCES os_sessions(id,mode,actor_id) ON DELETE CASCADE,
 FOREIGN KEY(property_id,mode) REFERENCES properties(id,mode),
 UNIQUE(mode,actor_id,idempotency_key), UNIQUE(id,mode,actor_id)
);
CREATE TABLE IF NOT EXISTS os_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mode text NOT NULL CHECK(mode IN ('DEMO','LIVE')),
 actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 session_id uuid NOT NULL, run_id uuid,
 role text NOT NULL CHECK(role IN ('USER','ASSISTANT')),
 content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(session_id,mode,actor_id) REFERENCES os_sessions(id,mode,actor_id) ON DELETE CASCADE,
 FOREIGN KEY(run_id,mode,actor_id) REFERENCES os_runs(id,mode,actor_id) ON DELETE CASCADE,
 UNIQUE(run_id,role)
);
CREATE TABLE IF NOT EXISTS os_memory (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mode text NOT NULL CHECK(mode IN ('DEMO','LIVE')),
 actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 content text NOT NULL CHECK(length(content) BETWEEN 1 AND 20000),
 tags jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS os_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 mode text NOT NULL CHECK(mode IN ('DEMO','LIVE')),
 actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 run_id uuid NOT NULL,
 level text NOT NULL CHECK(level IN ('INFO','WARNING','ERROR')),
 message text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(run_id,mode,actor_id) REFERENCES os_runs(id,mode,actor_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS os_worker_state (
 mode text PRIMARY KEY CHECK(mode IN ('DEMO','LIVE')),
 worker_id text NOT NULL, last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS os_runs_ready ON os_runs(mode,status,run_after);
CREATE INDEX IF NOT EXISTS os_sessions_actor ON os_sessions(actor_id,mode,updated_at DESC);
CREATE INDEX IF NOT EXISTS os_messages_actor ON os_messages(actor_id,mode,created_at);
CREATE INDEX IF NOT EXISTS os_events_actor ON os_events(actor_id,mode,id DESC);
CREATE INDEX IF NOT EXISTS os_memory_actor ON os_memory(actor_id,mode,updated_at DESC);
