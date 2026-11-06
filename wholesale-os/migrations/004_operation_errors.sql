CREATE TABLE IF NOT EXISTS operation_errors (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 mode text NOT NULL CHECK(mode IN ('DEMO','LIVE')),
 actor text NOT NULL,
 action text NOT NULL,
 entity_id text,
 error jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operation_errors_mode_time ON operation_errors(mode,created_at DESC);
