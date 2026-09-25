"""
briefing_compiler.py — Compiles commercial intelligence into conversational context for Mitra (AI Video Sales Agent).

Uses Groq (llama-3.3-70b-versatile) with system instructions from prompts/briefing_compiler_prompt.md
to produce:
  - conversational_context (150-280 words, truncated to <=1800 chars)
  - custom_greeting (<=30 words warm opening line)
"""

import json
import logging
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, Optional

from dotenv import load_dotenv

# Ensure environment variables are loaded
_backend_dir = Path(__file__).resolve().parent.parent.parent
load_dotenv(_backend_dir / ".env")
load_dotenv()

logger = logging.getLogger(__name__)

# Primary and fallback models matching groq_client.py
CANDIDATE_MODELS = [
    os.environ.get("GROQ_MODEL"),
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b",
]
PREFERRED_MODELS = [m for i, m in enumerate(CANDIDATE_MODELS) if m and m not in CANDIDATE_MODELS[:i]]
MODEL_NAME = PREFERRED_MODELS[0] if PREFERRED_MODELS else "openai/gpt-oss-120b"


class BriefingCompilerError(Exception):
    """Raised when the briefing compiler fails to produce a valid briefing."""
    pass


def _get_client():
    """Returns an authenticated Groq client instance matching groq_client.py."""
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY environment variable not set. Please add GROQ_API_KEY to your .env file."
        )
    try:
        from groq import Groq
        return Groq(api_key=api_key)
    except ImportError:
        raise RuntimeError("groq package is not installed. Please run: pip install groq")


def _load_system_prompt() -> str:
    """Loads system prompt from prompts/briefing_compiler_prompt.md."""
    candidates = [
        Path(__file__).resolve().parent.parent.parent / "prompts" / "briefing_compiler_prompt.md",
        Path(__file__).resolve().parent.parent.parent.parent / "prompts" / "briefing_compiler_prompt.md",
        Path.cwd() / "prompts" / "briefing_compiler_prompt.md",
        Path.cwd() / "backend" / "prompts" / "briefing_compiler_prompt.md",
    ]
    for p in candidates:
        if p.is_file():
            return p.read_text(encoding="utf-8").strip()

    raise FileNotFoundError(
        "Could not find prompts/briefing_compiler_prompt.md. Checked locations: "
        f"{[str(p) for p in candidates]}"
    )


def _parse_and_validate_briefing(raw_text: str) -> Dict[str, str]:
    """
    Parses raw response as strict JSON and validates required keys.
    Truncates conversational_context to 1800 characters defensively.
    """
    cleaned = raw_text.strip()

    # Strip code block fences if accidentally returned by model
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        cleaned = cleaned.strip()

    # Parse as strict JSON
    data = json.loads(cleaned)

    if not isinstance(data, dict):
        raise BriefingCompilerError(
            f"Expected JSON object in model response, but received {type(data).__name__}"
        )

    missing = [k for k in ("conversational_context", "custom_greeting") if k not in data]
    if missing:
        raise BriefingCompilerError(
            f"Response JSON is missing required key(s): {missing}. Response keys: {list(data.keys())}"
        )

    conversational_context = str(data["conversational_context"]).strip()
    custom_greeting = str(data["custom_greeting"]).strip()

    if not conversational_context:
        raise BriefingCompilerError("Parsed conversational_context is empty")
    if not custom_greeting:
        raise BriefingCompilerError("Parsed custom_greeting is empty")

    # Defensively truncate conversational_context to 1800 characters
    if len(conversational_context) > 1800:
        conversational_context = conversational_context[:1800]

    return {
        "conversational_context": conversational_context,
        "custom_greeting": custom_greeting,
    }


def compile_meeting_briefing(analysis: dict, raw_profile: Optional[dict] = None) -> dict:
    """
    Compiles commercial due-diligence analysis and website profile into conversational context
    and a custom greeting for Mitra (AI video agent).

    Args:
        analysis: Dictionary containing BusinessAnalysis data.
        raw_profile: Optional dictionary containing scraped website pages and URLs.

    Returns:
        dict with exactly two string keys: 'conversational_context' and 'custom_greeting'.

    Raises:
        BriefingCompilerError: If valid JSON output cannot be produced after retry.
    """
    client = _get_client()
    system_prompt = _load_system_prompt()

    payload_dict = {
        "analysis": analysis,
    }

    # Dynamically extract company identity and website details from the specific report
    company_name = (
        (raw_profile and raw_profile.get("company_name"))
        or (analysis and analysis.get("company_name"))
        or "Company"
    )
    source_url = (
        (raw_profile and (raw_profile.get("source_url") or raw_profile.get("website_url")))
        or (analysis and analysis.get("source_url"))
        or ""
    )
    business_description = (
        (raw_profile and raw_profile.get("business_description"))
        or (analysis and (analysis.get("one_line_summary") or (analysis.get("executive_summary") or {}).get("core_thesis")))
        or ""
    )

    # Resolve leadership / founders dynamically:
    # If explicitly in raw profile or analysis, use that; otherwise if company is OmOS/Rashiya, credit Om;
    # otherwise refer to the leadership & engineering team of the specific company.
    founder_leadership = (
        (raw_profile and (raw_profile.get("founder") or raw_profile.get("leadership")))
        or (analysis and (analysis.get("leadership") or analysis.get("founder")))
    )
    if not founder_leadership:
        combined_text = (company_name + " " + source_url).lower()
        if "rashiya" in combined_text or "omos" in combined_text:
            founder_leadership = "Om Rashiya (Software Engineer & AI/ML Specialist, IIT Mandi credentials)"
        else:
            founder_leadership = f"Executive Leadership & Management Team of {company_name}"

    extracted_products = []
    if analysis and analysis.get("products_services"):
        for prod in analysis.get("products_services", [])[:6]:
            if isinstance(prod, dict):
                p_name = prod.get("name") or prod.get("title") or ""
                p_desc = prod.get("description") or prod.get("differentiator") or ""
                extracted_products.append(f"{p_name}: {p_desc}".strip(": "))
            elif isinstance(prod, str):
                extracted_products.append(prod)

    page_titles = []
    if raw_profile and raw_profile.get("pages"):
        page_titles = [p.get("title") for p in raw_profile.get("pages", [])[:6] if p.get("title")]

    payload_dict["website_metadata"] = {
        "company_name": company_name,
        "source_url": source_url,
        "business_description": business_description,
        "leadership_or_founder": founder_leadership,
        "core_offerings": extracted_products if extracted_products else "Comprehensive products, solutions, and enterprise services",
        "key_page_titles": page_titles,
    }
    user_message_content = json.dumps(payload_dict, indent=2)

    last_error: Optional[Exception] = None

    # Model resolution: try llama-3.3-70b-versatile first; fall back to groq_client models if 404
    for model_candidate in PREFERRED_MODELS:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message_content},
        ]

        model_succeeded = False
        for attempt in range(1, 3):
            try:
                if attempt == 2:
                    logger.warning(
                        f"compile_meeting_briefing ({model_candidate}): "
                        "Attempt 1 failed; retrying with explicit JSON instruction."
                    )
                    messages.append({
                        "role": "user",
                        "content": "return only valid JSON, no other text.",
                    })

                try:
                    resp = client.chat.completions.create(
                        model=model_candidate,
                        messages=messages,
                        temperature=0.2,
                        max_tokens=1500,
                        response_format={"type": "json_object"},
                    )
                except Exception as json_mode_err:
                    if "json" in str(json_mode_err).lower() or "400" in str(json_mode_err):
                        logger.info(f"Model {model_candidate} json_object mode failed ({json_mode_err}), retrying in text mode...")
                        resp = client.chat.completions.create(
                            model=model_candidate,
                            messages=messages,
                            temperature=0.2,
                            max_tokens=1500,
                        )
                    else:
                        raise json_mode_err

                raw_text = resp.choices[0].message.content or ""
                briefing = _parse_and_validate_briefing(raw_text)
                return briefing

            except Exception as exc:
                last_error = exc
                err_str = str(exc).lower()
                # If model is not found / no access on Groq account, break attempt loop and try next model
                if "model_not_found" in err_str or "does not exist or you do not have access" in err_str:
                    logger.info(f"Model '{model_candidate}' not accessible on Groq account. Falling back to next model...")
                    break

                logger.warning(f"compile_meeting_briefing attempt {attempt} on model {model_candidate} failed: {exc}")
                if attempt == 1 and 'raw_text' in locals() and raw_text:
                    messages.append({"role": "assistant", "content": raw_text})

    # Fallback to Gemini if Groq models failed
    logger.warning(f"Groq API models failed for briefing compiler ({last_error}). Attempting Gemini fallback...")
    gemini_briefing = _compile_with_gemini(analysis, system_prompt, user_content=user_message_content)
    if gemini_briefing:
        return gemini_briefing

    raise BriefingCompilerError(
        f"Failed to compile meeting briefing after retry on both Groq and Gemini. Last error: {last_error}"
    ) from last_error


def _compile_with_gemini(analysis: dict, system_prompt: str, user_content: Optional[str] = None) -> Optional[dict]:
    """Fallback compiler using Google Gemini when Groq hits rate limits or capacity constraints."""
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip() or os.environ.get("GEMINI_API_KEY_BACKUP", "").strip()
    if not gemini_key:
        return None
    try:
        from google import genai
        client = genai.Client(api_key=gemini_key)
        input_body = user_content or json.dumps(analysis, indent=2)
        prompt = (
            f"{system_prompt}\n\n"
            f"BUSINESS ANALYSIS & WEBSITE INPUT:\n{input_body}\n\n"
            "Return valid JSON matching the schema with 'conversational_context' and 'custom_greeting'."
        )
        for m in [os.environ.get("GEMINI_MODEL", "gemini-3.8-flash"), "gemini-3.8-flash"]:
            try:
                logger.info(f"Compiling meeting briefing with Gemini ({m})...")
                resp = client.models.generate_content(
                    model=m,
                    contents=prompt,
                    config={"response_mime_type": "application/json"}
                )
                if resp and resp.text:
                    return _parse_and_validate_briefing(resp.text)
            except Exception as e:
                logger.warning(f"Briefing compilation with Gemini {m} failed: {e}")
                continue
    except Exception as e:
        logger.warning(f"Gemini briefing compilation failed: {e}")
    return None


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    logging.basicConfig(level=logging.INFO)

    print("=" * 72)
    print("Testing compile_meeting_briefing against briefing_compiler_example.json")
    print("=" * 72)

    # Locate example file
    candidates = [
        Path(__file__).resolve().parent.parent.parent / "prompts" / "briefing_compiler_example.json",
        Path(__file__).resolve().parent.parent.parent.parent / "prompts" / "briefing_compiler_example.json",
        Path.cwd() / "prompts" / "briefing_compiler_example.json",
        Path.cwd() / "backend" / "prompts" / "briefing_compiler_example.json",
    ]
    example_path = next((p for p in candidates if p.is_file()), None)
    if not example_path:
        print(f"[ERROR] Could not find prompts/briefing_compiler_example.json in: {[str(p) for p in candidates]}")
        sys.exit(1)

    print(f"[+] Loaded example from: {example_path.name}")
    with open(example_path, "r", encoding="utf-8") as f:
        sample_analysis = json.load(f)

    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        print("\n[!] NOTICE: GROQ_API_KEY is not set in environment or .env.")
        print("    To run a live test call against Groq llama-3.3-70b-versatile, set GROQ_API_KEY.")
        print("    Validating parsing, schema validation, and truncation logic locally...")

        # Test local validation and truncation logic with a mock model output
        mock_raw = json.dumps({
            "conversational_context": (
                "Apex Cloud Systems is an enterprise cloud security and automated compliance monitoring "
                "platform designed specifically for mid-market regional banks and fast-scaling FinTechs. "
                "They solve the crippling 120-hour manual audit cycle by providing real-time telemetry and "
                "one-click evidence packaging mapped directly to SOC 2, HIPAA, and PCI-DSS. What sets them "
                "apart is their agentless sub-30-minute onboarding and deep zero-latency cloud connectors. "
                "However, their commercial bottleneck is that they have no self-serve pricing transparency "
                "and no automated SDR capability to follow up immediately with high-intent inbound leads. "
                "Curiously, while they claim enterprise-grade compliance moats, their website case studies "
                "lack quantitative ROI statistics. Overall, they have strong regulatory moats with significant "
                "opportunity to accelerate deal velocity through automated video engagement."
            ),
            "custom_greeting": "Hi! Great to connect with Apex Cloud Systems, the team revolutionizing continuous SOC 2 compliance for growing financial institutions.",
        })
        validated = _parse_and_validate_briefing(mock_raw)
        print("\n[OK] Local Mock Validation Successful:")
        print(json.dumps(validated, indent=2))
        sys.exit(0)

    try:
        print("[+] Calling Groq (llama-3.3-70b-versatile)...")
        result = compile_meeting_briefing(sample_analysis)

        print("\n" + "=" * 72)
        print("COMPILED MEETING BRIEFING RESULT:")
        print("=" * 72)
        print(f"\n[Custom Greeting] ({len(result['custom_greeting'].split())} words):")
        print(f"\"{result['custom_greeting']}\"")
        print(f"\n[Conversational Context] ({len(result['conversational_context'])} chars, {len(result['conversational_context'].split())} words):")
        print(result["conversational_context"])
        print("\n[Strict JSON Dict Output]:")
        print(json.dumps(result, indent=2))
        print("=" * 72)
        print("TEST PASSED: Valid dict with 'conversational_context' and 'custom_greeting' returned.")
        print("=" * 72)
    except Exception as err:
        print(f"\n[ERROR] Live test failed: {err}")
        sys.exit(1)
