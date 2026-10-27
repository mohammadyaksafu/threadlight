"""Turn an uploaded file into text per page, keeping the page number for citations.

Order of methods per page:
1. Docling layout parsing of the PDF text layer (when installed; the worker image has it).
2. pypdfium2 text layer (fallback when Docling is not installed).
3. Tesseract OCR (`eng+ben`) on the rendered page when the page has no usable text layer (scans,
   photos) or contains Bangla: PDF text layers often store Bangla glyphs out of logical order, so OCR
   of the rendered page gives cleaner Unicode text than the layer itself.
"""

import io
import re
from dataclasses import dataclass
from functools import lru_cache

import structlog

log = structlog.get_logger()
BENGALI = re.compile(r"[ঀ-৿]")
MIN_TEXT = 25


@dataclass
class Page:
    page: int
    text: str
    method: str


@lru_cache
def _docling():
    try:
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import PdfPipelineOptions
        from docling.document_converter import DocumentConverter, PdfFormatOption

        opts = PdfPipelineOptions(do_ocr=False, do_table_structure=True)
        return DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=opts)})
    except Exception:
        return None


def ocr_available() -> bool:
    try:
        import pytesseract

        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def _ocr(image) -> str:
    import pytesseract

    return pytesseract.image_to_string(image, lang="eng+ben", config="--psm 4")


def _docling_pages(data: bytes, filename: str) -> dict[int, str]:
    conv = _docling()
    if conv is None:
        return {}
    try:
        from docling.datamodel.base_models import DocumentStream

        doc = conv.convert(DocumentStream(name=filename, stream=io.BytesIO(data))).document
        return {n: doc.export_to_markdown(page_no=n) for n in range(1, doc.num_pages() + 1)}
    except Exception as e:
        log.warning("docling_failed", file=filename, error=str(e))
        return {}


def parse_pdf(data: bytes, filename: str) -> list[Page]:
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(data)
    dl = _docling_pages(data, filename)
    can_ocr = ocr_available()
    pages = []
    for i in range(len(pdf)):
        n = i + 1
        layer = pdf[i].get_textpage().get_text_range()
        text, method = (dl[n], "docling") if dl.get(n, "").strip() else (layer, "pdf-text")
        needs_ocr = len(layer.strip()) < MIN_TEXT or bool(BENGALI.search(layer))
        if needs_ocr and can_ocr:
            image = pdf[i].render(scale=200 / 72).to_pil()
            text, method = _ocr(image), "tesseract"
        elif needs_ocr:
            log.warning("ocr_unavailable", file=filename, page=n)
        pages.append(Page(n, text.strip(), method))
    return pages


def parse_image(data: bytes, filename: str) -> list[Page]:
    from PIL import Image

    if not ocr_available():
        raise RuntimeError("Tesseract is not installed; images cannot be read")
    return [Page(1, _ocr(Image.open(io.BytesIO(data))).strip(), "tesseract")]


def parse(data: bytes, mime: str, filename: str) -> list[Page]:
    if mime == "application/pdf" or filename.lower().endswith(".pdf"):
        return parse_pdf(data, filename)
    return parse_image(data, filename)
