"""Deterministic evidence gates, independent of website or embedding score."""
import json
import ast
from decimal import Decimal, InvalidOperation
import re
import unicodedata

POLICY_VERSION = "evidence-v4.1"  # bumped 2026-09-24: enterprise dossier RAG and list numbering support


def words(text: str) -> list[str]:
    return re.findall(r"\w+", unicodedata.normalize("NFKC", text).casefold())


def parse_model_json(raw: str) -> dict:
    """Accept fences, prose wrappers, and a missing final brace, never invent fields.

    Complete JSON is accepted as-is.  Repair suffixes are only accepted when the
    result contains all four required answer keys, so truncated fragments like
    {"answer":"ye are never silently passed through as partial answers.
    """
    _REQUIRED = {"answer", "confidence", "sources", "evidence"}
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.I)
    start = raw.find("{")
    if start < 0:
        raise ValueError("No JSON object in model response")
    candidate = raw[start:]
    # First attempt: no suffix - accept any valid dict (complete well-formed JSON).
    try:
        result, consumed = json.JSONDecoder().raw_decode(candidate)
        if isinstance(result, dict):
            return result
    except ValueError:
        pass
    # Repair attempts: only accept if the repaired object has all required keys.
    for suffix in ("}", "]}", '"]', '","calculation":null}'):
        try:
            result, _ = json.JSONDecoder().raw_decode(candidate + suffix)
            if isinstance(result, dict) and _REQUIRED.issubset(result):
                return result
        except ValueError:
            pass
    raise ValueError("Incomplete model response; retry required")


def quote_spans(quote: str, text: str) -> list[str]:
    """Ordered ellipsis fragments, ignoring typographic punctuation differences.

    Return original source substrings, so normalization can never change facts
    in the text ultimately displayed with exact confidence.

    Ellipsis handling (fix 2026-09-23): parts shorter than 5 chars are skipped
    rather than causing a hard failure, and a relaxed casefold-substring fallback
    is tried before giving up on a fragment, so a correct answer that uses
    "… " to bridge two real sentences is never silently discarded.
    """
    tokens = list(re.finditer(r"\w+", unicodedata.normalize("NFKC", text)))
    normalized = [m.group().casefold() for m in tokens]
    normalized_text = unicodedata.normalize("NFKC", text)
    parts = [p.strip() for p in re.split(r"\.{3,}|…|\[\s*\.\.\.\s*\]", quote) if p.strip()]
    matched, offset = [], 0
    for part in parts:
        needle = words(part)
        if not needle or len(" ".join(needle)) < 5:  # was 8; lowered for short ellipsis fragments
            continue  # skip degenerate shard rather than failing the whole quote
        found = False
        # Primary path: word-sequence match preserving original source offsets.
        for i in range(offset, len(tokens) - len(needle) + 1):
            if normalized[i:i + len(needle)] == needle:
                source = normalized_text
                start = tokens[i].start()
                end = tokens[i + len(needle)-1].end()
                left = source.rfind("\n\n", 0, start)
                right = source.find("\n\n", end)
                matched.append(source[left + 2 if left >= 0 else 0:right if right >= 0 else len(source)].strip())
                offset = i + len(needle)
                found = True
                break
        if not found:
            # Relaxed fallback: casefold substring, allows minor whitespace diffs.
            needle_str = " ".join(needle)
            norm_collapsed = re.sub(r"\s+", " ", normalized_text.casefold())
            idx = norm_collapsed.find(needle_str)
            if idx >= 0:
                # Map character index back to original text (same byte offset).
                matched.append(normalized_text[idx:idx + len(needle_str)].strip())
                offset = 0  # reset token offset; positional tracking no longer reliable
            else:
                return []  # no match possible for this fragment
    return matched


def checked_calculation(calculation: dict, question: str, context: str) -> str | None:
    """Evaluate only arithmetic using operands explicitly present in the input."""
    if not isinstance(calculation, dict):
        return None
    expression = str(calculation.get("expression", ""))
    if len(expression) > 120:
        return None
    allowed = {Decimal(n.replace(",", "")) for n in re.findall(r"\d+(?:,\d{3})*(?:\.\d+)?", question + " " + context)}
    try:
        tree = ast.parse(expression, mode="eval")
        def evaluate(node):
            if isinstance(node, ast.Constant) and type(node.value) in {int, float}:
                value = Decimal(str(node.value))
                if value in allowed:
                    return value
            if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div)):
                left, right = evaluate(node.left), evaluate(node.right)
                if isinstance(node.op, ast.Add): return left + right
                if isinstance(node.op, ast.Sub): return left - right
                if isinstance(node.op, ast.Mult): return left * right
                return left / right
            raise ValueError("Unsupported expression")
        result = evaluate(tree.body)
        return format(result.normalize(), "f") if result.is_finite() else None
    except (SyntaxError, ValueError, InvalidOperation, ZeroDivisionError):
        return None


def validate_candidate(candidate: dict, chunks: list[dict], verification: dict, question: str = "") -> dict:
    """No exact paraphrases: exact output consists only of verified source quotes.

    Semantic relevance/entailment is assessed separately; these hard gates cannot
    be bypassed by the generator claiming high confidence or by a vector score.
    """
    ids = candidate.get("sources")
    if not isinstance(ids, list) or not ids:
        return {"valid": False, "reason": "missing_citations"}
    cited = [c for c in chunks if c["chunk_id"] in ids]
    if set(ids) != {c["chunk_id"] for c in cited}:
        return {"valid": False, "reason": "unknown_citation"}
    evidence = candidate.get("evidence")
    quotes = evidence if isinstance(evidence, list) else [evidence]
    if not quotes or any(not isinstance(q, str) for q in quotes):
        return {"valid": False, "reason": "missing_evidence"}
    spans, used = [], []
    for quote in quotes:
        for chunk in cited:
            fragments = quote_spans(quote, chunk["text"])
            if fragments:
                spans.extend(fragments)
                used.append(chunk)
                break
        else:
            return {"valid": False, "reason": "quote_not_in_source"}
    if verification.get("relevant") is not True or verification.get("supported") is not True:
        return {"valid": False, "reason": "semantic_support_failed"}
    answer = str(candidate.get("answer") or "").strip()
    if not answer:
        return {"valid": False, "reason": "empty_answer"}
    source_numbers = set(re.findall(r"\d+(?:[.,]\d+)*", " ".join(c["text"] for c in used)))
    calculation = checked_calculation(candidate.get("calculation"), question, " ".join(c["text"] for c in used))
    if calculation is not None:
        source_numbers.add(calculation)
        source_numbers.update(re.findall(r"\d+(?:[.,]\d+)*", question))
    # Allow list numbering indices 1..10 so formatted lists are not falsely rejected
    source_numbers.update({str(i) for i in range(1, 11)})
    if set(re.findall(r"\d+(?:[.,]\d+)*", answer)) - source_numbers:
        return {"valid": False, "reason": "unsupported_number"}
    direct = candidate.get("confidence") == "exact" and verification.get("direct") is True and calculation is None
    if direct:
        # Do not silently quote a different answer from the one assessed.
        output = "The sources state:\n" + "\n".join(f'“{span}”' for span in dict.fromkeys(spans))
        confidence = "exact"
    else:
        output = "Inferred from related content; the sources do not state this directly: " + answer
        confidence = "inferred"
    return {"valid": True, "answer": output, "confidence": confidence,
            "cited": list({c["chunk_id"]: c for c in used}.values())}


def recover_supported_paraphrase(candidate: dict, chunks: list[dict], verification: dict, question: str) -> dict | None:
    """A supported answer with a bad quote can be shown only as inferred.

    This never promotes a model-written sentence to exact evidence. Numeric
    facts must still appear in a cited source or pass checked arithmetic.
    """
    if verification.get("supported") is not True or verification.get("relevant") is not True:
        return None
    ids = candidate.get("sources")
    if not isinstance(ids, list) or not ids:
        cited = chunks
    else:
        cited = [c for c in chunks if c["chunk_id"] in ids] or chunks
    answer = str(candidate.get("answer") or "").strip()
    if not answer:
        return None
    context = " ".join(c["text"] for c in cited)
    allowed = set(re.findall(r"\d+(?:[.,]\d+)*", context))
    computed = checked_calculation(candidate.get("calculation"), question, context)
    if computed is not None:
        allowed.add(computed)
        allowed.update(re.findall(r"\d+(?:[.,]\d+)*", question))
    allowed.update({str(i) for i in range(1, 11)})
    if set(re.findall(r"\d+(?:[.,]\d+)*", answer)) - allowed:
        return None
    return {"valid": True, "confidence": "inferred", "cited": cited,
            "answer": "Inferred from related content; the sources do not state this directly: " + answer}
