"""
manual_doc_verification.py — Standalone runnable script with printed PASS/FAIL results.

Verification items:
1. Feed encrypted/password-protected PPTX (OLE-wrapped) -> clean degraded message, no hang, no crash.
2. Feed JSON with 10,000+ item array -> truncated with marker, not dumped whole into text.
3. Feed JSON nested 60+ levels deep -> rejected with UnsafeFileError, no recursion error or timeout.
4. Verify normalizer integration -> confidence & extraction method formatted into intelligence dossier.
"""

import io
import json
import sys
import time
from pathlib import Path

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Ensure backend root is in sys.path
_backend_root = Path(__file__).resolve().parent.parent
if str(_backend_root) not in sys.path:
    sys.path.insert(0, str(_backend_root))

from app.services.doc_processor import process_documents
from app.services.normalizer import build_profile, profile_to_markdown


def log_result(test_name: str, passed: bool, detail: str = ""):
    status = "PASS" if passed else "FAIL"
    symbol = "[OK]" if passed else "[X]"
    print(f"[{status}] {symbol} {test_name}")
    if detail:
        print(f"       {detail}")


def test_encrypted_pptx():
    """
    Test 1: Feed real encrypted/password-protected PPTX (OLE Compound Document binary header).
    Standard Office password-protected files start with the OLE CFB header D0 CF 11 E0 A1 B1 1A E1.
    """
    print("\n--- Test 1: Password-protected / Encrypted PPTX (OLE-wrapped) ---")
    # OLE Compound File header used by password-protected Office Open XML documents
    ole_header = bytes([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])
    ole_mock_payload = ole_header + b"\x00" * 512 + b"EncryptedPackage" + b"\x00" * 512

    start_t = time.time()
    results = process_documents([("confidential_financials.pptx", ole_mock_payload)])
    duration = time.time() - start_t

    res = results[0]
    has_error = res.get("error") is not None
    no_hang = duration < 3.0  # Must return immediately, never hang
    clean_message = "encrypted" in str(res.get("error")).lower() or "corrupt" in str(res.get("error")).lower()
    content_empty = res.get("content_text") == ""

    passed = has_error and no_hang and clean_message and content_empty
    detail = (
        f"Handled in {duration:.3f}s. "
        f"error='{res.get('error')}', extraction_method='{res.get('extraction_method')}', "
        f"confidence={res.get('confidence')}"
    )
    log_result("Encrypted PPTX produces clean degraded error without hang/500", passed, detail)
    return passed


def test_large_array_json():
    """
    Test 2: Feed JSON with 12,500 items in an array.
    Must truncate at 10,000 items with explicit '... 2,500 more items' marker.
    """
    print("\n--- Test 2: JSON with 10,000+ Item Array ---")
    data = {
        "dataset_name": "annual_transactions",
        "records": [f"transaction_{i}" for i in range(12500)],
    }
    json_bytes = json.dumps(data).encode("utf-8")

    results = process_documents([("transactions.json", json_bytes)])
    res = results[0]
    text = res.get("content_text", "")

    has_marker = "... 2,500 more items (truncated — original array had 12,500 items)" in text
    not_dumped_whole = "transaction_12499" not in text
    has_first_items = "transaction_0" in text and "transaction_9999" in text
    method_direct = res.get("extraction_method") == "json_direct"
    conf_1 = res.get("confidence") == 1.0

    passed = has_marker and not_dumped_whole and has_first_items and method_direct and conf_1
    detail = (
        f"Marker present: {has_marker}, Full dump prevented: {not_dumped_whole}, "
        f"Method: {res.get('extraction_method')}, Confidence: {res.get('confidence')}"
    )
    log_result("JSON array > 10,000 items truncated with explicit marker", passed, detail)
    return passed


def test_deep_nesting_json():
    """
    Test 3: Feed JSON nested 65 levels deep (> 50 limit).
    Must be rejected with UnsafeFileError, no recursion error, no timeout.
    """
    print("\n--- Test 3: JSON Nested 65 Levels Deep ---")
    nested: dict = {"bottom_key": "deep_val"}
    for i in range(65):
        nested = {f"nest_{65 - i}": nested}

    json_bytes = json.dumps(nested).encode("utf-8")

    start_t = time.time()
    results = process_documents([("nested_exploit.json", json_bytes)])
    duration = time.time() - start_t

    res = results[0]
    rejected = res.get("extraction_method") == "rejected"
    conf_zero = res.get("confidence") == 0.0
    content_empty = res.get("content_text") == ""
    error_msg = str(res.get("error", ""))
    depth_mentioned = "depth" in error_msg.lower() and "50" in error_msg

    passed = rejected and conf_zero and content_empty and depth_mentioned and (duration < 2.0)
    detail = (
        f"Handled in {duration:.3f}s. error='{error_msg}', "
        f"extraction_method='{res.get('extraction_method')}', confidence={res.get('confidence')}"
    )
    log_result("JSON nested 60+ levels safely rejected (no stack overflow/hang)", passed, detail)
    return passed


def test_normalizer_intelligence_dossier():
    """
    Test 4: Verify normalizer.py formats confidence metadata into the intelligence dossier.
    """
    print("\n--- Test 4: Normalizer Integration & Confidence Formatting ---")
    docs = [
        {
            "filename": "deck.pptx",
            "size_bytes": 10240,
            "doc_type": "presentation",
            "content_text": "Slide 1: Q4 Pitch",
            "error": None,
            "source": "user_upload",
            "extraction_method": "python-pptx",
            "confidence": 1.0,
        },
        {
            "filename": "metrics.json",
            "size_bytes": 2048,
            "doc_type": "json",
            "content_text": "**arr:** 5000000",
            "error": None,
            "source": "user_upload",
            "extraction_method": "json_direct",
            "confidence": 1.0,
        },
        {
            "filename": "fallback.pptx",
            "size_bytes": 5120,
            "doc_type": "presentation",
            "content_text": "Slide 1 (XML fallback): Recovered title",
            "error": None,
            "source": "user_upload",
            "extraction_method": "pptx_xml_fallback",
            "confidence": 0.85,
        },
    ]

    profile = build_profile(
        source_url="https://example.com",
        pages=[{"url": "https://example.com", "title": "Home", "text": "Welcome", "tier": "first_party", "confidence": 1.0}],
        processed_docs=docs,
    )

    markdown = profile_to_markdown(profile)

    has_pptx_meta = "extraction=python-pptx | confidence=1.00" in markdown
    has_json_meta = "extraction=json_direct | confidence=1.00" in markdown
    has_fallback_meta = "extraction=pptx_xml_fallback | confidence=0.85" in markdown

    passed = has_pptx_meta and has_json_meta and has_fallback_meta
    detail = (
        f"pptx_meta: {has_pptx_meta}, json_meta: {has_json_meta}, fallback_meta: {has_fallback_meta}"
    )
    log_result("Dossier contains extraction_method and confidence annotations", passed, detail)
    return passed


def main():
    print("================================================================")
    print("vyepariX — Manual Document Processor Verification Suite")
    print("================================================================")

    results = [
        test_encrypted_pptx(),
        test_large_array_json(),
        test_deep_nesting_json(),
        test_normalizer_intelligence_dossier(),
    ]

    print("\n================================================================")
    passed_count = sum(1 for r in results if r)
    total_count = len(results)
    print(f"Summary: {passed_count}/{total_count} manual checks PASSED.")
    print("================================================================")

    if passed_count != total_count:
        sys.exit(1)


if __name__ == "__main__":
    main()
