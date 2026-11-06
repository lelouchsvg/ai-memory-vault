CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS sellers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mode text NOT NULL CHECK(mode IN ('DEMO','LIVE')),
 data jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,mode)
);
CREATE TABLE IF NOT EXISTS buyers (LIKE sellers INCLUDING ALL);
CREATE TABLE IF NOT EXISTS properties (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mode text NOT NULL CHECK(mode IN ('DEMO','LIVE')),
 deal_id text NOT NULL UNIQUE, seller_id uuid, data jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,mode),
 FOREIGN KEY(seller_id,mode) REFERENCES sellers(id,mode)
);
CREATE UNIQUE INDEX IF NOT EXISTS property_address_unique ON properties(mode,lower(trim(data->>'address')),lower(trim(data->>'city')),upper(trim(data->>'state')),(data->>'zip'));
CREATE SEQUENCE IF NOT EXISTS deal_number_seq START 1;
CREATE TABLE IF NOT EXISTS comps (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),mode text NOT NULL CHECK(mode IN ('DEMO','LIVE')),property_id uuid NOT NULL,
 data jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,mode),FOREIGN KEY(property_id,mode) REFERENCES properties(id,mode)
);
CREATE TABLE IF NOT EXISTS repairs (LIKE comps INCLUDING ALL);
ALTER TABLE repairs DROP CONSTRAINT IF EXISTS repairs_property_id_mode_fkey;
ALTER TABLE repairs ADD CONSTRAINT repairs_property_id_mode_fkey FOREIGN KEY(property_id,mode) REFERENCES properties(id,mode);
CREATE TABLE IF NOT EXISTS documents (LIKE comps INCLUDING ALL);
ALTER TABLE documents ADD CONSTRAINT documents_property_id_mode_fkey FOREIGN KEY(property_id,mode) REFERENCES properties(id,mode);
CREATE TABLE IF NOT EXISTS closings (LIKE comps INCLUDING ALL);
ALTER TABLE closings ADD CONSTRAINT closings_property_id_mode_fkey FOREIGN KEY(property_id,mode) REFERENCES properties(id,mode);
CREATE UNIQUE INDEX IF NOT EXISTS closing_property_unique ON closings(property_id);
CREATE TABLE IF NOT EXISTS deadlines (LIKE comps INCLUDING ALL);
ALTER TABLE deadlines ADD CONSTRAINT deadlines_property_id_mode_fkey FOREIGN KEY(property_id,mode) REFERENCES properties(id,mode);
CREATE TABLE IF NOT EXISTS matches (LIKE comps INCLUDING ALL);
ALTER TABLE matches ADD COLUMN IF NOT EXISTS buyer_id uuid NOT NULL;
ALTER TABLE matches ADD CONSTRAINT matches_property_id_mode_fkey FOREIGN KEY(property_id,mode) REFERENCES properties(id,mode);
ALTER TABLE matches ADD CONSTRAINT matches_buyer_id_mode_fkey FOREIGN KEY(buyer_id,mode) REFERENCES buyers(id,mode);
CREATE UNIQUE INDEX IF NOT EXISTS match_unique ON matches(property_id,buyer_id);
CREATE TABLE IF NOT EXISTS tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),mode text NOT NULL CHECK(mode IN ('DEMO','LIVE')),property_id uuid,
 seller_id uuid,buyer_id uuid,data jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,mode),FOREIGN KEY(property_id,mode) REFERENCES properties(id,mode),FOREIGN KEY(seller_id,mode) REFERENCES sellers(id,mode),FOREIGN KEY(buyer_id,mode) REFERENCES buyers(id,mode)
);
CREATE UNIQUE INDEX IF NOT EXISTS task_dedupe ON tasks(mode,(data->>'dedupeKey')) WHERE data->>'dedupeKey' IS NOT NULL;
CREATE TABLE IF NOT EXISTS approvals (LIKE tasks INCLUDING ALL);
ALTER TABLE approvals ADD CONSTRAINT approvals_property_id_mode_fkey FOREIGN KEY(property_id,mode) REFERENCES properties(id,mode);
ALTER TABLE approvals ADD CONSTRAINT approvals_seller_id_mode_fkey FOREIGN KEY(seller_id,mode) REFERENCES sellers(id,mode);
ALTER TABLE approvals ADD CONSTRAINT approvals_buyer_id_mode_fkey FOREIGN KEY(buyer_id,mode) REFERENCES buyers(id,mode);
CREATE TABLE IF NOT EXISTS transactions (LIKE tasks INCLUDING ALL);
ALTER TABLE transactions ADD CONSTRAINT transactions_property_id_mode_fkey FOREIGN KEY(property_id,mode) REFERENCES properties(id,mode);
CREATE UNIQUE INDEX IF NOT EXISTS transaction_reference_unique ON transactions(mode,(data->>'reference')) WHERE data->>'reference' IS NOT NULL;
CREATE TABLE IF NOT EXISTS notifications (LIKE tasks INCLUDING ALL);
ALTER TABLE notifications ADD CONSTRAINT notifications_property_id_mode_fkey FOREIGN KEY(property_id,mode) REFERENCES properties(id,mode);
CREATE UNIQUE INDEX IF NOT EXISTS notification_dedupe ON notifications(mode,(data->>'dedupeKey')) WHERE data->>'dedupeKey' IS NOT NULL;
CREATE TABLE IF NOT EXISTS settings (
 mode text PRIMARY KEY CHECK(mode IN ('DEMO','LIVE')),data jsonb NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS agent_status (
 mode text NOT NULL CHECK(mode IN ('DEMO','LIVE')),name text NOT NULL,status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','PAUSED')),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(mode,name)
);
CREATE TABLE IF NOT EXISTS agent_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),mode text NOT NULL CHECK(mode IN ('DEMO','LIVE')),property_id uuid,agent text NOT NULL,
 status text NOT NULL CHECK(status IN ('RUNNING','COMPLETED','FAILED','BLOCKED')),output jsonb NOT NULL DEFAULT '{}',error jsonb,
 started_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,FOREIGN KEY(property_id,mode) REFERENCES properties(id,mode)
);
CREATE TABLE IF NOT EXISTS audit_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),mode text NOT NULL CHECK(mode IN ('DEMO','LIVE')),actor text NOT NULL,actor_type text NOT NULL DEFAULT 'USER',
 action text NOT NULL,entity text NOT NULL,entity_id uuid,property_id uuid,old_value jsonb,new_value jsonb,reason text NOT NULL DEFAULT '',source text NOT NULL DEFAULT 'APPLICATION',created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(property_id,mode) REFERENCES properties(id,mode)
);
CREATE FUNCTION forbid_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit history is immutable'; END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();
CREATE TABLE IF NOT EXISTS jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),mode text NOT NULL CHECK(mode IN ('DEMO','LIVE')),property_id uuid,kind text NOT NULL,payload jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','RUNNING','COMPLETED','FAILED')),attempts int NOT NULL DEFAULT 0,max_attempts int NOT NULL DEFAULT 3,
 run_after timestamptz NOT NULL DEFAULT now(),locked_at timestamptz,last_error jsonb,idempotency_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(mode,idempotency_key),FOREIGN KEY(property_id,mode) REFERENCES properties(id,mode)
);
CREATE TABLE IF NOT EXISTS idempotency (
 mode text NOT NULL,actor text NOT NULL,key text NOT NULL,request_hash text NOT NULL,response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(mode,actor,key)
);
CREATE INDEX IF NOT EXISTS property_mode_idx ON properties(mode);
CREATE INDEX IF NOT EXISTS jobs_ready_idx ON jobs(status,run_after);
CREATE INDEX IF NOT EXISTS audit_mode_time_idx ON audit_log(mode,created_at DESC);
CREATE INDEX IF NOT EXISTS tasks_mode_status_idx ON tasks(mode,(data->>'status'));
CREATE INDEX IF NOT EXISTS approvals_mode_status_idx ON approvals(mode,(data->>'status'));
