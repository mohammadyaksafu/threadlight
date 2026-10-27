"""Re-parse and re-index one document (e.g. a scan first processed on a machine without OCR).

    python -m backend.workers.reindex <tenant_id> <factory_id> <document_code>

Only pages and chunks are rebuilt; extracted fields, approvals and the audit trail are left untouched.
"""

import sys

from backend.db.session import audit, one, tenant_tx
from backend.ocr.parse import parse
from backend.rag.index import index_document
from backend.services import storage


def main(tenant_id: int, factory_id: int, code: str):
    with tenant_tx(tenant_id) as c:
        d = one(c, "SELECT id, file_key, mime, filename FROM documents WHERE factory_id = :f AND code = :c", f=factory_id, c=code)
        if not d:
            sys.exit("document not found")
    pages = parse(storage.get(d["file_key"]), d["mime"], d["filename"])
    with tenant_tx(tenant_id) as c:
        c.exec_driver_sql("DELETE FROM pages WHERE document_id = %s", (d["id"],))
        for p in pages:
            c.exec_driver_sql("INSERT INTO pages (tenant_id, document_id, page, text, method) VALUES (%s, %s, %s, %s, %s)",
                              (tenant_id, d["id"], p.page, p.text, p.method))
        stats = index_document(c, tenant_id, d["id"])
        audit(c, tenant_id, "system", "document_reindexed", "document:%d" % d["id"], {"methods": sorted({p.method for p in pages}), **stats})
    print(code, [p.method for p in pages], stats)


if __name__ == "__main__":
    main(int(sys.argv[1]), int(sys.argv[2]), sys.argv[3])
