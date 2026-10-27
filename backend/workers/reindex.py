"""Re-parse and re-index one document (e.g. a scan first processed on a machine without OCR).

    python -m backend.workers.reindex <tenant_id> <factory_id> <document_code> [<file to attach>]

Only pages and chunks are rebuilt; extracted fields, approvals and the audit trail are left untouched.
The optional file is stored first when the document has none (seeded, pre-extracted v1 documents), so the
seeded demo factory becomes searchable.
"""

import hashlib
import sys
from pathlib import Path

from backend.db.session import audit, one, tenant_tx
from backend.ocr.parse import parse
from backend.rag.index import index_document
from backend.services import storage


def main(tenant_id: int, factory_id: int, code: str, attach: str | None = None):
    with tenant_tx(tenant_id) as c:
        d = one(c, "SELECT id, file_key, mime, filename FROM documents WHERE factory_id = :f AND code = :c", f=factory_id, c=code)
        if not d:
            sys.exit("document not found")
        if not d["file_key"] and attach:
            data = Path(attach).read_bytes()
            sha = hashlib.sha256(data).hexdigest()
            d["file_key"] = "t%d/f%d/%s/%s" % (tenant_id, factory_id, sha[:16], d["filename"])
            storage.put(d["file_key"], data, d["mime"])
            c.exec_driver_sql("UPDATE documents SET file_key = %s, sha256 = %s WHERE id = %s", (d["file_key"], sha, d["id"]))
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
    main(int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else None)
