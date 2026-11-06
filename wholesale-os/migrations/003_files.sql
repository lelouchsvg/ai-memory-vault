CREATE TABLE IF NOT EXISTS document_files (
  document_id uuid PRIMARY KEY,
  mode text NOT NULL CHECK(mode IN ('DEMO','LIVE')),
  filename text NOT NULL,
  mime_type text NOT NULL,
  bytes bytea NOT NULL CHECK(octet_length(bytes)<=10485760),
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(document_id,mode) REFERENCES documents(id,mode)
);
