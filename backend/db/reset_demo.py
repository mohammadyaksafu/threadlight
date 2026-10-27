"""Put the public demo factory back to its starting state (coverage 29, risk 63).

    python -m backend.db.reset_demo

Removes documents uploaded after seeding (renewals, extra uploads) with their jobs' links, review items,
mappings and chunks, and the drafted reports. Seeded v1 documents, users and the append-only audit log stay.
"""

from backend.db.session import admin_tx

SEEDED = ("D1", "D2", "D3", "D4", "D5", "D6")


def main():
    with admin_tx() as c:
        ids = [r[0] for r in c.exec_driver_sql(
            "SELECT id FROM documents WHERE factory_id = 1 AND NOT (code = ANY(%s))", (list(SEEDED),))]
        if ids:
            c.exec_driver_sql("DELETE FROM review_items WHERE document_id = ANY(%s)", (ids,))
            c.exec_driver_sql("DELETE FROM mappings WHERE document_id = ANY(%s)", (ids,))
            c.exec_driver_sql("UPDATE jobs SET document_id = NULL WHERE document_id = ANY(%s)", (ids,))
            c.exec_driver_sql("DELETE FROM documents WHERE id = ANY(%s)", (ids,))
        c.exec_driver_sql("DELETE FROM mappings WHERE factory_id = 1 AND method = 'mcp-proposal'")
        c.exec_driver_sql("DELETE FROM review_items WHERE status = 'open' AND document_id IS NULL")
        c.exec_driver_sql("DELETE FROM reports WHERE factory_id = 1")
    print("demo reset: removed %d uploaded document(s)" % len(ids))


if __name__ == "__main__":
    main()
