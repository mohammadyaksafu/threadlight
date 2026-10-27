"""Initial schema: tenants, evidence, RAG index, findings, audit, LLM call log, row-level security.

Revision ID: 0001
"""

import os

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

# Every table that holds tenant data. Each gets the same RLS policy keyed by app.tenant_id.
TENANT_TABLES = [
    "users", "frameworks", "requirements", "factories", "documents", "pages", "extracted_fields",
    "chunks", "clause_chunks", "mappings", "corrective_actions", "alerts", "findings",
    "finding_events", "audit_log", "llm_calls", "jobs", "review_items", "webhooks", "reports",
]

SCHEMA = """
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE tenants (
  id serial PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE users (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('officer', 'staff', 'viewer', 'auditor'))
);

CREATE TABLE frameworks (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  version text NOT NULL DEFAULT '',
  evidence_types jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE requirements (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id),
  framework_id int NOT NULL REFERENCES frameworks(id),
  code text NOT NULL,
  clause text NOT NULL,
  title text NOT NULL,
  title_bn text NOT NULL DEFAULT '',
  text text NOT NULL,
  criticality int NOT NULL,
  needs jsonb NOT NULL,
  department text NOT NULL,
  max_age jsonb NOT NULL DEFAULT '{}',
  UNIQUE (framework_id, code)
);

CREATE TABLE factories (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id),
  framework_id int NOT NULL REFERENCES frameworks(id),
  name text NOT NULL,
  normalized_name text NOT NULL,
  buyer text NOT NULL DEFAULT '',
  scenario text NOT NULL DEFAULT '',
  audit_date date NOT NULL,
  scenario_today date,           -- fixed "today" for the synthetic scenario; NULL = real date
  demo jsonb NOT NULL DEFAULT '{}' -- offline-demo extras (the sample renewal) passed to the web app
);

CREATE TABLE documents (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id),
  factory_id int NOT NULL REFERENCES factories(id),
  code text NOT NULL,              -- D1, D2 ... as shown in the UI and the rules engine
  file_key text,
  filename text NOT NULL,
  mime text NOT NULL DEFAULT 'application/pdf',
  sha256 text,
  type text,
  title text NOT NULL DEFAULT '',
  ref text,
  entity text,
  issued date,
  valid_until date,
  cites jsonb NOT NULL DEFAULT '[]',
  source_page int NOT NULL DEFAULT 1,
  confidence real,
  verified boolean NOT NULL DEFAULT false,
  verified_by text,
  verified_at timestamptz,
  supersedes text,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'needs_review', 'extracted', 'failed', 'duplicate')),
  prompt_version text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (factory_id, code)
);
CREATE INDEX documents_factory_type ON documents (factory_id, type);
CREATE INDEX documents_valid_until ON documents (valid_until);
CREATE INDEX documents_sha ON documents (factory_id, sha256);

CREATE TABLE pages (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id),
  document_id int NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page int NOT NULL,
  text text NOT NULL,
  method text NOT NULL,            -- docling | pdf-text | tesseract
  UNIQUE (document_id, page)
);

CREATE TABLE extracted_fields (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id),
  document_id int NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  field text NOT NULL,
  value text,
  page int,
  confidence real NOT NULL,
  source_span text,
  corrected_by text,
  UNIQUE (document_id, field)
);

CREATE TABLE chunks (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id),
  document_id int NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page int NOT NULL,
  text text NOT NULL,
  context text NOT NULL DEFAULT '',
  content_hash text NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, context || ' ' || text)) STORED,
  embedding vector(1024),
  embed_model text                 -- queries only compare vectors from the same model
);
CREATE INDEX chunks_tsv ON chunks USING gin (tsv);
CREATE INDEX chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE TABLE clause_chunks (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id),
  requirement_id int NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  text text NOT NULL,
  context text NOT NULL DEFAULT '',
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, context || ' ' || text)) STORED,
  embedding vector(1024),
  embed_model text
);
CREATE INDEX clause_chunks_tsv ON clause_chunks USING gin (tsv);
CREATE INDEX clause_chunks_embedding ON clause_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE TABLE mappings (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id),
  factory_id int NOT NULL REFERENCES factories(id),
  requirement_id int NOT NULL REFERENCES requirements(id),
  document_id int NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_id int REFERENCES chunks(id) ON DELETE SET NULL,
  score real NOT NULL,
  method text NOT NULL,            -- hybrid+rerank | mcp-proposal | manual
  note text,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'confirmed', 'rejected')),
  confirmed_by text,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requirement_id, document_id)
);

CREATE TABLE corrective_actions (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id),
  factory_id int NOT NULL REFERENCES factories(id),
  code text NOT NULL,
  title text NOT NULL,
  claimed_status text NOT NULL,
  closure_evidence jsonb NOT NULL DEFAULT '[]',
  requirement_code text,
  UNIQUE (factory_id, code)
);

CREATE TABLE alerts (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id),
  factory_id int NOT NULL REFERENCES factories(id),
  code text NOT NULL,
  type text NOT NULL,
  severity text NOT NULL,
  subject jsonb NOT NULL,
  related jsonb NOT NULL,
  requirements jsonb NOT NULL,
  message text NOT NULL,
  verify text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE findings (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id),
  factory_id int NOT NULL REFERENCES factories(id),
  requirement_code text NOT NULL,
  state text NOT NULL DEFAULT 'detected',
  approver text,
  evidence jsonb NOT NULL DEFAULT '[]',
  UNIQUE (factory_id, requirement_code)
);

CREATE TABLE finding_events (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id),
  finding_id int NOT NULL REFERENCES findings(id),
  state text NOT NULL,
  actor_type text NOT NULL,
  actor_id text,
  approver text,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id),
  actor text NOT NULL,
  action text NOT NULL,
  target text,
  payload jsonb NOT NULL DEFAULT '{}',
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE llm_calls (
  id bigserial PRIMARY KEY,
  tenant_id int REFERENCES tenants(id),
  purpose text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  prompt_version text,
  input_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  cached_tokens int NOT NULL DEFAULT 0,
  latency_ms int NOT NULL DEFAULT 0,
  cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
  cache_hit boolean NOT NULL DEFAULT false,
  ok boolean NOT NULL DEFAULT true,
  trace_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE jobs (
  id uuid PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id),
  factory_id int NOT NULL REFERENCES factories(id),
  document_id int REFERENCES documents(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued', 'running', 'waiting_review', 'waiting_approval', 'done', 'failed')),
  step text NOT NULL DEFAULT 'queued',
  events jsonb NOT NULL DEFAULT '[]',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE review_items (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id),
  job_id uuid REFERENCES jobs(id),
  document_id int REFERENCES documents(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('fields', 'approval')),
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE webhooks (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id),
  url text NOT NULL,
  secret text NOT NULL,
  events jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reports (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id),
  factory_id int NOT NULL REFERENCES factories(id),
  lang text NOT NULL,
  body jsonb NOT NULL,
  model text,
  prompt_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Append-only tables: no updates or deletes, whoever asks.
CREATE FUNCTION tl_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION tl_append_only();
CREATE TRIGGER finding_events_append_only BEFORE UPDATE OR DELETE ON finding_events
  FOR EACH ROW EXECUTE FUNCTION tl_append_only();

-- Sign-in happens before the tenant is known, so the lookup runs as the table owner.
CREATE FUNCTION tl_auth_user(p_email text)
RETURNS TABLE (id int, tenant_id int, name text, role text, password_hash text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id, tenant_id, name, role, password_hash FROM users WHERE lower(email) = lower(p_email)
$$;
"""


def upgrade():
    op.execute(SCHEMA)
    password = os.environ.get("APP_DB_PASSWORD", "tl_app").replace("'", "''")
    op.execute("""
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tl_app') THEN
        CREATE ROLE tl_app LOGIN NOBYPASSRLS;
      END IF;
    END $$;""")
    op.execute("ALTER ROLE tl_app PASSWORD '%s'" % password)
    op.execute("GRANT USAGE ON SCHEMA public TO tl_app")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tl_app")
    op.execute("GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO tl_app")
    op.execute("REVOKE UPDATE, DELETE ON audit_log, finding_events FROM tl_app")
    op.execute("GRANT EXECUTE ON FUNCTION tl_auth_user(text) TO tl_app")

    op.execute("ALTER TABLE tenants ENABLE ROW LEVEL SECURITY")
    op.execute("CREATE POLICY tenant_isolation ON tenants USING (id = NULLIF(current_setting('app.tenant_id', true), '')::int)")
    for t in TENANT_TABLES:
        op.execute("ALTER TABLE %s ENABLE ROW LEVEL SECURITY" % t)
        op.execute(
            "CREATE POLICY tenant_isolation ON %s USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int) "
            "WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)" % t
        )


def downgrade():
    for t in reversed(["tenants"] + TENANT_TABLES):
        op.execute("DROP TABLE IF EXISTS %s CASCADE" % t)
    op.execute("DROP FUNCTION IF EXISTS tl_auth_user(text)")
    op.execute("DROP FUNCTION IF EXISTS tl_append_only()")
