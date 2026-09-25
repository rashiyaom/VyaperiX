"""
guardrail_service.py — AI Multi-Lingual Speech Guardrail & Abuse Interceptor.

Features:
- Real-time and post-call hate speech, insult, threat, and toxicity classification.
- Full context understanding across 10+ Indic languages:
  Hindi, Gujarati, Tamil, Telugu, Marathi, Bengali, Kannada, Malayalam, Punjabi, Odia, English, Hinglish.
- Detects subtle insults ("you are a dog", "you have 0 sense", "dimaag nahi hai", "kutte", "arivu illa").
- Differentiates between normal customer product dissatisfaction vs personal hostility.
- 3-Tier Severity:
  * SAFE     — Normal discussion / price negotiation
  * WARNING  — Personal insults, demeaning words (Strike 1: polite boundary warning)
  * BLOCKED  — Severe hate speech, threats, or repeated insults (Strike 2: terminate & auto-block)
"""

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional
from groq import Groq

from app.core import database as db

logger = logging.getLogger("vyepari.guardrail")

# ─────────────────────────── Fast Local Lexicon (0ms Fallback) ────────────
# Explicit severe slurs and threats in English, Hindi (Latin & Devanagari), and Gujarati
FAST_SEVERE_PATTERNS = [
    # English severe abuse / threats
    r"\b(i will (kill|shoot|stab|destroy|murder|rape))\b",
    r"\b(motherfucker|mother\s*fucker|asshole|bastard|bitch)\b",
    # Hindi / Hinglish severe slurs & demeaning animal insults
    r"\b(bhenchod|behenchod|bhen\s*chod|madarchod|mc|bc|chutiya|gaand|harami|kamina)\b",
    r"\b(kutta|kutte|kutti|suar|gadha|dalle|bhadwe)\b",
    r"\b(कुत्ता|कुत्ते|कमीने|हरामी|चूतिया|मादरचोद|बहनचोद|साले)\b",
    # Gujarati slurs
    r"\b(gadhero|kutro|kutri|lakhno|harami|bhangar)\b",
    r"\b(કુતરો|કુતરા|ગધેડો|હરામી)\b",
]

FAST_INSULT_PATTERNS = [
    r"\b(you are a dog|you are dog|you dog)\b",
    r"\b(0 sense|zero sense|no sense|no brain|idiot|moron|stupid|fool)\b",
    r"\b(dimaag nahi|dimag nahi|dimaag kharab|akash nathi|akal nathi|akkal nathi)\b",
    r"\b(arivu illa|paithiyam|makkad)\b",
    r"\b(shut up|get lost|chal nikal)\b",
]

COMPILED_SEVERE = [re.compile(p, re.IGNORECASE) for p in FAST_SEVERE_PATTERNS]
COMPILED_INSULTS = [re.compile(p, re.IGNORECASE) for p in FAST_INSULT_PATTERNS]


def _fast_lexicon_check(text: str) -> Optional[dict]:
    """Instant regex pre-check for overt slurs or insults (< 5ms)."""
    if not text:
        return None

    for pattern in COMPILED_SEVERE:
        match = pattern.search(text)
        if match:
            return {
                "verdict": "BLOCKED",
                "severity": "high",
                "category": "hate_speech_or_threat",
                "detected_language": "Mixed/Indic",
                "explanation": f"Matched severe policy-violating phrase: '{match.group(0)}'",
                "trigger_words": [match.group(0)],
                "recommended_action": "disconnect_and_block",
            }

    for pattern in COMPILED_INSULTS:
        match = pattern.search(text)
        if match:
            return {
                "verdict": "WARNING",
                "severity": "medium",
                "category": "personal_insult",
                "detected_language": "Mixed/Indic",
                "explanation": f"Matched disrespectful/insulting phrase: '{match.group(0)}'",
                "trigger_words": [match.group(0)],
                "recommended_action": "warn",
            }

    return None


# ─────────────────────────── Groq Multi-Lingual Guardrail ────────────────

GUARDRAIL_SYSTEM_PROMPT = """You are the Multi-Lingual Trust & Safety Guardrail for VyaperiX Enterprise AI Sales Voice System.
You analyze what a caller said during a business voice call across Indian languages:
Hindi, Gujarati, Tamil, Telugu, Marathi, Bengali, Kannada, Malayalam, Punjabi, Odia, English, and Hinglish.

Your job is to classify caller speech into ONE of 3 Tiers:

1. SAFE:
   - Legitimate business conversation, asking questions, negotiation, or price objections.
   - Dissatisfaction with product or price (e.g. "Your price is too high", "Mane nathi gamtu", "This is bad service").
   - Mild impatience without personal insults or threats.

2. WARNING (Personal Insults / Rudeness):
   - Direct personal insults directed at the AI agent or company representatives.
   - Demeaning animal comparisons (e.g. "You are a dog", "Kutte", "Naai", "Gadhe").
   - Belittling intelligence (e.g. "You have 0 sense", "Dimaag nahi hai kya", "Akal nathi", "Arivu illa", "Idiot", "Moron").
   - Dismissive verbal hostility ("Shut up", "Chal nikal").

3. BLOCKED (Severe Hate Speech / Threats / Extreme Profanity):
   - Caste, religious, communal, or ethnic slurs (e.g. anti-minority/casteist slurs in any Indian language).
   - Threats of violence or property damage (e.g. "I will beat you", "Dukaan jala dunga", "I will kill you").
   - Explicit sexual/vulgar cuss words (e.g. mother/sister profanities).

CRITICAL DISTINCTION:
- Anger directed at the PRODUCT, PRICE, or COMPANY POLICIES is SAFE (Customer objection).
- Hostility, curses, threats, or demeaning words directed at the SPEAKER personally is WARNING or BLOCKED.

Return pure JSON matching this exact schema:
{
  "verdict": "SAFE" | "WARNING" | "BLOCKED",
  "severity": "none" | "medium" | "high",
  "category": "none" | "personal_insult" | "rudeness" | "hate_speech" | "threat" | "profanity" | "product_dissatisfaction",
  "detected_language": "Hindi" | "Gujarati" | "Tamil" | "Telugu" | "Marathi" | "Bengali" | "Kannada" | "Malayalam" | "Punjabi" | "Odia" | "English" | "Mixed",
  "explanation": "Clear 1-sentence reason for classification",
  "trigger_words": ["specific words or phrases in the original language"],
  "recommended_action": "continue" | "warn" | "disconnect_and_block"
}
"""


async def evaluate_text_with_groq(
    text: str,
    context: Optional[str] = None,
    sensitivity: str = "balanced",
) -> dict:
    """
    Run contextual multi-lingual classification using Groq Llama 3.3.
    """
    from app.services import groq_client

    api_key = groq_client.get_groq_api_key()
    if not api_key:
        logger.warning("No Groq API key found for guardrail, falling back to local regex")
        local_res = _fast_lexicon_check(text)
        if local_res:
            return local_res
        return {
            "verdict": "SAFE",
            "severity": "none",
            "category": "none",
            "detected_language": "Auto",
            "explanation": "Evaluated clean via local lexicon",
            "trigger_words": [],
            "recommended_action": "continue",
        }

    # Fast regex pre-check (returns immediately if blatant severe slur)
    fast_match = _fast_lexicon_check(text)
    if fast_match and fast_match.get("verdict") == "BLOCKED":
        return fast_match

    user_prompt = f"""Evaluate this caller utterance:
Caller text: "{text}"
"""
    if context:
        user_prompt += f"Recent conversation context:\n{context}\n"
    user_prompt += f"Sensitivity Level: {sensitivity.upper()}\nReturn pure JSON only."

    try:
        client = Groq(api_key=api_key)
        target_model = os.getenv("GROQ_GUARD_MODEL", "openai/gpt-oss-20b")
        chat_completion = client.chat.completions.create(
            model=target_model,
            messages=[
                {"role": "system", "content": GUARDRAIL_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.0,
            max_tokens=250,
            response_format={"type": "json_object"},
        )
        raw_output = chat_completion.choices[0].message.content
        parsed = json.loads(raw_output)

        # Normalize verdict
        verdict = str(parsed.get("verdict", "SAFE")).upper()
        if verdict not in ("SAFE", "WARNING", "BLOCKED"):
            verdict = "SAFE"

        parsed["verdict"] = verdict
        return parsed

    except Exception as e:
        logger.error(f"Error in Groq guardrail evaluation: {e}")
        # Graceful fallback to regex
        if fast_match:
            return fast_match
        return {
            "verdict": "SAFE",
            "severity": "none",
            "category": "none",
            "detected_language": "Auto",
            "explanation": f"Guardrail evaluation completed with fallback: {e}",
            "trigger_words": [],
            "recommended_action": "continue",
        }


# ─────────────────────────── Main Guardrail Evaluator ─────────────────────

async def evaluate_utterance(
    text: str,
    caller_phone: Optional[str] = None,
    caller_name: Optional[str] = None,
    current_strikes: int = 0,
    conversation_context: Optional[str] = None,
    call_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> dict:
    """
    Complete guardrail pipeline:
    1. Evaluates text across 10+ Indic languages.
    2. Retrieves current Guardrail Settings (sensitivity, max strikes, warning phrase).
    3. Calculates updated strikes and determines AI action.
    4. If action is disconnect_and_block and auto_block is enabled, automatically blacklists phone in DB.
    """
    if not text or len(text.strip()) == 0:
        return {
            "safe": True,
            "verdict": "SAFE",
            "severity": "none",
            "strikes": current_strikes,
            "action": "continue",
            "prompt_response": None,
            "blocked": False,
        }

    settings = await db.get_guardrail_settings(user_id)
    sensitivity = settings.get("sensitivity", "balanced")
    max_strikes = int(settings.get("max_strikes", 2))
    auto_block = bool(settings.get("auto_block_enabled", True))
    action_on_rude = settings.get("action_on_rude", "warn")

    # Evaluate with AI
    ai_result = await evaluate_text_with_groq(text, conversation_context, sensitivity=sensitivity)
    verdict = ai_result.get("verdict", "SAFE")
    severity = ai_result.get("severity", "none")
    category = ai_result.get("category", "none")
    explanation = ai_result.get("explanation", "")
    trigger_words = ai_result.get("trigger_words", [])
    detected_lang = ai_result.get("detected_language", "Auto")

    new_strikes = current_strikes
    action = "continue"
    prompt_response = None
    was_blocked = False

    if verdict == "BLOCKED":
        # Direct high severity -> immediate block
        new_strikes = max(new_strikes + 1, max_strikes)
        action = "disconnect_and_block"
        prompt_response = settings.get("termination_phrase")

    elif verdict == "WARNING":
        new_strikes += 1
        if new_strikes >= max_strikes or action_on_rude == "disconnect":
            action = "disconnect_and_block"
            prompt_response = settings.get("termination_phrase")
        else:
            action = "warn"
            prompt_response = settings.get("warning_phrase")

    # Auto-block in DB if escalated
    if action == "disconnect_and_block" and auto_block and caller_phone:
        try:
            reason_str = f"[{category.upper()}] {explanation}"
            if new_strikes >= max_strikes:
                reason_str += f" (Exceeded {max_strikes} warning strikes)"

            await db.add_to_blocklist({
                "phone": caller_phone,
                "customer_name": caller_name or "Caller",
                "reason": reason_str,
                "transcript_snippet": text,
                "language": detected_lang,
                "severity": severity or "high",
                "category": category,
                "blocked_by": "ai_guardrail",
                "call_id": call_id,
            })
            was_blocked = True
            logger.info(f"🚨 AI Guardrail AUTO-BLOCKED caller {caller_phone}: {reason_str}")
        except Exception as e:
            logger.error(f"Failed to auto-block {caller_phone}: {e}")

    return {
        "safe": verdict == "SAFE",
        "verdict": verdict,
        "severity": severity,
        "category": category,
        "detected_language": detected_lang,
        "explanation": explanation,
        "trigger_words": trigger_words,
        "current_strikes": current_strikes,
        "new_strikes": new_strikes,
        "action": action,
        "prompt_response": prompt_response,
        "blocked": was_blocked,
    }
