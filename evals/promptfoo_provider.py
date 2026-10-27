"""promptfoo custom provider: runs the production extraction prompt (backend/prompts) through the router.

promptfoo passes the test's vars; `doc_id` selects a labelled document. The provider parses it (cached),
redacts it and returns the model's JSON, which the assertions in promptfooconfig.yaml compare with the
ground truth. Set PROMPTFOO_MODEL to a models.yaml key (default: the extraction primary).
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.llm import router  # noqa: E402
from evals.common import EVIDENCE_TYPES, llm_pages, load_dataset, pages_for  # noqa: E402

_DATA = {r["doc_id"]: r for r in load_dataset()}


def call_api(prompt, options, context):
    rec = _DATA[context["vars"]["doc_id"]]
    pages, _ = llm_pages(pages_for(rec), [])
    model = os.environ.get("PROMPTFOO_MODEL")
    try:
        res = router.complete("extract", "extract", {"evidence_types": EVIDENCE_TYPES, "filename": rec["file"], "pages": pages},
                              models=[model] if model else None, max_tokens=3000)
    except Exception as e:
        return {"error": str(e)}
    return {"output": json.dumps(res.data, ensure_ascii=False),
            "tokenUsage": {"prompt": res.usage.get("input", 0), "completion": res.usage.get("output", 0),
                           "cached": res.usage.get("cached", 0), "total": res.usage.get("input", 0) + res.usage.get("output", 0)}}
