"""
test_doc_processor_extensions.py — Automated tests for doc_processor.py extensions.

Covers:
- PPTX Layer 1 (python-pptx with notes and tables)
- PPTX Layer 2 (XML zipfile fallback)
- PPTX zip-bomb rejection before decompression
- PPTX nested group shape recursive extraction (regression guard)
- JSON valid nested parsing with correct confidence
- JSON excessive depth rejection (UnsafeFileError)
- JSON excessive array length truncation with explicit marker
- JSON malformed fallback to raw text with parse error noted
- Confidence metadata retrofit across all supported formats (PDF, CSV, XLSX, TXT, DOCX, Image)
"""

import io
import json
import zipfile
from unittest.mock import MagicMock, patch

import pytest
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE
from pptx.util import Inches

from app.services.doc_processor import (
    EXTRACTION_CONFIDENCE,
    UnsafeFileError,
    _check_zip_bomb,
    _walk_shapes,
    extract_json,
    extract_pptx,
    process_documents,
)


# ------------------------------------------------------------------ PPTX Tests --


def _create_valid_pptx() -> bytes:
    prs = Presentation()
    blank_layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(blank_layout)

    # Text box
    txBox = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(5), Inches(1))
    txBox.text_frame.text = "Quarterly Revenue Report"

    # Speaker notes
    notes_slide = slide.notes_slide
    notes_slide.notes_text_frame.text = "Discuss Q3 projections with stakeholders"

    # Table
    table_shape = slide.shapes.add_table(2, 2, Inches(1), Inches(2.5), Inches(4), Inches(1))
    table = table_shape.table
    table.cell(0, 0).text = "Region"
    table.cell(0, 1).text = "Growth"
    table.cell(1, 0).text = "APAC"
    table.cell(1, 1).text = "+24%"

    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


def test_pptx_valid_file_layer1_succeeds():
    pptx_bytes = _create_valid_pptx()
    files = [("revenue.pptx", pptx_bytes)]

    results = process_documents(files)
    assert len(results) == 1
    res = results[0]

    assert res["error"] is None
    assert res["doc_type"] == "presentation"
    assert res["extraction_method"] == "python-pptx"
    assert res["confidence"] == 1.0
    assert res["source"] == "user_upload"

    text = res["content_text"]
    assert "Quarterly Revenue Report" in text
    assert "[Speaker Notes]: Discuss Q3 projections with stakeholders" in text
    assert "APAC" in text
    assert "+24%" in text


def test_pptx_corrupt_zip_triggers_layer2():
    # Build a zip archive that is NOT a valid presentation for python-pptx,
    # but contains ppt/slides/slide1.xml with readable text runs.
    buf = io.BytesIO()
    xml_content = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
           xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld>
        <p:spTree>
          <p:sp>
            <p:txBody>
              <a:p>
                <a:r>
                  <a:t>Recovered XML Text Content</a:t>
                </a:r>
              </a:p>
            </p:txBody>
          </p:sp>
        </p:spTree>
      </p:cSld>
    </p:sld>"""

    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("ppt/slides/slide1.xml", xml_content)

    corrupt_pptx = buf.getvalue()
    text, method = extract_pptx(corrupt_pptx, "corrupt.pptx")

    assert method == "pptx_xml_fallback"
    assert "Recovered XML Text Content" in text
    assert "Slide 1 (XML fallback)" in text


def test_pptx_zip_bomb_rejected_before_extraction():
    # Create in-memory zip declaring 205MB uncompressed size via deflated zeros (~200KB payload)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("large_data.xml", b"0" * (205 * 1024 * 1024))

    bomb_bytes = buf.getvalue()

    # Direct check raises UnsafeFileError
    with pytest.raises(UnsafeFileError) as exc_info:
        _check_zip_bomb(bomb_bytes)
    assert "zip-bomb" in str(exc_info.value).lower()

    # process_documents catches it gracefully per-file without crashing
    files = [
        ("bomb.pptx", bomb_bytes),
        ("valid.txt", b"Safe text file"),
    ]
    results = process_documents(files)
    assert len(results) == 2

    # File 1 was safely rejected
    assert results[0]["extraction_method"] == "rejected"
    assert results[0]["confidence"] == 0.0
    assert results[0]["content_text"] == ""
    assert "zip-bomb" in results[0]["error"].lower()

    # File 2 was processed normally
    assert results[1]["error"] is None
    assert results[1]["content_text"] == "Safe text file"
    assert results[1]["confidence"] == 0.5


def test_pptx_nested_group_shapes_text_extracted():
    # Regression guard: naive slide.shapes misses shapes nested inside GroupShape
    parent_group = MagicMock()
    parent_group.shape_type = MSO_SHAPE_TYPE.GROUP

    child_box = MagicMock()
    child_box.shape_type = None
    child_box.has_text_frame = True
    child_box.has_table = False

    para = MagicMock()
    para.text = "Nested text inside group"
    child_box.text_frame.paragraphs = [para]

    parent_group.shapes = [child_box]

    extracted = _walk_shapes([parent_group])
    assert "Nested text inside group" in extracted


# ------------------------------------------------------------------ JSON Tests --


def test_json_valid_nested_parses_with_correct_confidence():
    payload = {
        "company": "Acme Corp",
        "metrics": {"arr": 1500000, "growth": 0.45},
        "tags": ["b2b", "saas"],
    }
    json_bytes = json.dumps(payload).encode("utf-8")
    files = [("data.json", json_bytes)]

    results = process_documents(files)
    assert len(results) == 1
    res = results[0]

    assert res["error"] is None
    assert res["doc_type"] == "json"
    assert res["extraction_method"] == "json_direct"
    assert res["confidence"] == 1.0
    assert res["source"] == "user_upload"

    text = res["content_text"]
    assert "**company:** Acme Corp" in text
    assert "**arr:** 1500000" in text
    assert "- b2b" in text


def test_json_excessive_depth_rejected():
    # Construct an object 55 levels deep (> 50 limit)
    deep_obj: dict = {"val": "bottom"}
    for _ in range(55):
        deep_obj = {"nest": deep_obj}

    json_bytes = json.dumps(deep_obj).encode("utf-8")
    files = [("deep.json", json_bytes)]

    results = process_documents(files)
    assert len(results) == 1
    res = results[0]

    assert res["extraction_method"] == "rejected"
    assert res["confidence"] == 0.0
    assert res["content_text"] == ""
    assert "nesting depth exceeds" in res["error"]


def test_json_excessive_array_length_truncated_with_marker():
    # Array with 10,050 items (exceeds 10,000 limit)
    large_list = [f"item_{i}" for i in range(10050)]
    payload = {"items": large_list}
    json_bytes = json.dumps(payload).encode("utf-8")

    text, method = extract_json(json_bytes, "large_array.json")
    assert method == "json_direct"
    assert "... 50 more items (truncated — original array had 10,050 items)" in text


def test_json_malformed_falls_back_to_raw_text_with_error_noted():
    # JS-style / malformed JSON (trailing comma, unquoted key)
    malformed = b'{\n  company: "Acme",\n  "status": "active",\n}'
    files = [("broken.json", malformed)]

    results = process_documents(files)
    assert len(results) == 1
    res = results[0]

    assert res["error"] is None
    assert res["doc_type"] == "json"
    assert res["extraction_method"] == "json_raw_fallback"
    assert res["confidence"] == 0.5

    text = res["content_text"]
    assert "[JSON PARSE ERROR in broken.json:" in text
    assert "Raw file content (parse failed — degraded signal):" in text
    assert 'company: "Acme"' in text


# -------------------------------------------------- Retrofit Across All Formats --


@pytest.mark.parametrize(
    "filename, content, expected_type, expected_min_conf",
    [
        ("report.csv", b"col1,col2\nval1,val2\n", "spreadsheet", 1.0),
        ("notes.txt", b"Plain text notes for the sales meeting.", "text", 0.5),
        ("notes.md", b"# Markdown Header\nSome markdown text", "text", 0.5),
    ],
)
def test_all_existing_formats_emit_confidence_metadata(
    filename, content, expected_type, expected_min_conf
):
    files = [(filename, content)]
    results = process_documents(files)
    assert len(results) == 1
    res = results[0]

    assert res["error"] is None
    assert res["doc_type"] == expected_type
    assert res["source"] == "user_upload"
    assert res["extraction_method"] in EXTRACTION_CONFIDENCE
    assert res["confidence"] >= expected_min_conf
    assert len(res["content_text"]) > 0


def test_pdf_emits_confidence_metadata():
    # Mock extract_pdf to test process_documents dispatch retrofit
    with patch("app.services.doc_processor.extract_pdf", return_value=("Extracted PDF text", "pdfplumber")):
        files = [("sample.pdf", b"%PDF-1.4 dummy bytes")]
        results = process_documents(files)
        assert len(results) == 1
        res = results[0]
        assert res["doc_type"] == "pdf"
        assert res["extraction_method"] == "pdfplumber"
        assert res["confidence"] == 1.0
        assert res["source"] == "user_upload"
        assert res["content_text"] == "Extracted PDF text"


def test_image_emits_confidence_metadata():
    # Mock extract_image_description to test process_documents dispatch retrofit
    with patch("app.services.doc_processor.extract_image_description", return_value=("Image showing charts", "gemini_vision")):
        files = [("chart.png", b"\x89PNG\r\n\x1a\n dummy bytes")]
        results = process_documents(files)
        assert len(results) == 1
        res = results[0]
        assert res["doc_type"] == "image"
        assert res["extraction_method"] == "gemini_vision"
        assert res["confidence"] == 0.75
        assert res["source"] == "user_upload"
        assert res["content_text"] == "Image showing charts"
