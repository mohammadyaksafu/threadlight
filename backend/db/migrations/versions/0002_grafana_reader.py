"""Read-only Grafana role, pinned to the demo tenant by row-level security.

Grafana cannot set app.tenant_id per query, so the role carries it as a default (ALTER ROLE ... SET); the
existing tenant_isolation policies then show it tenant 1 only. SELECT only, and only on the tables the
dashboards read: no users, pages, chunks, extracted text or webhooks.

Revision ID: 0002
"""

import os

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

TABLES = ["llm_calls", "jobs", "documents", "review_items", "audit_log", "mappings", "findings", "alerts", "factories"]


def upgrade():
    password = os.environ.get("GRAFANA_DB_PASSWORD", "tl_grafana").replace("'", "''")
    op.execute("""DO $$ BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tl_grafana') THEN CREATE ROLE tl_grafana LOGIN; END IF;
                  END $$""")
    op.execute("ALTER ROLE tl_grafana PASSWORD '%s'" % password)
    op.execute("ALTER ROLE tl_grafana SET app.tenant_id = '1'")
    op.execute("ALTER ROLE tl_grafana SET default_transaction_read_only = on")
    op.execute("GRANT USAGE ON SCHEMA public TO tl_grafana")
    op.execute("GRANT SELECT ON %s TO tl_grafana" % ", ".join(TABLES))


def downgrade():
    op.execute("REVOKE ALL ON %s FROM tl_grafana" % ", ".join(TABLES))
    op.execute("REVOKE USAGE ON SCHEMA public FROM tl_grafana")
    op.execute("DROP ROLE IF EXISTS tl_grafana")
