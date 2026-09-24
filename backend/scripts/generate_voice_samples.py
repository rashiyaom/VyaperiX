"""
generate_voice_samples.py — Batch Pre-generator for Sarvam AI Voice Demo Samples.

Generates high-fidelity static audio files for all landing-page demo agents
and saves them directly into frontend/public/audio/samples/.
This ensures 0ms latency and $0.00 ongoing API cost on public landing pages.

Usage:
    cd backend
    python3 scripts/generate_voice_samples.py
"""

import os
import sys
import asyncio
import base64
from pathlib import Path

# Add backend directory to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app.services.sarvam_service import synthesize_speech, get_sarvam_api_key

# Destination directory in frontend
OUTPUT_DIR = BASE_DIR.parent / "frontend" / "public" / "audio" / "samples"

SAMPLE_PHRASES = [
    # Hindi Agents
    {
        "filename": "hi-saanvi-default.wav",
        "agent": "Saanvi (Hindi SDR)",
        "text": "नमस्ते! मैं व्यापारी X से सान्वी बात कर रही हूँ। क्या आप अपनी सेल्स टीम के लिए AI ऑटोमेशन एक्सप्लोर करना चाहेंगे?",
        "lang": "hi-IN",
        "speaker": "priya",
    },
    {
        "filename": "hi-saanvi-pitch.wav",
        "agent": "Saanvi (Hindi SDR)",
        "text": "नमस्ते! मैं व्यापारी X से सान्वी बात कर रही हूँ। आपने क्लाउड और ERP माइग्रेशन के लिए पोस्ट किया था — क्या यह प्रोजेक्ट अभी एक्टिव है?",
        "lang": "hi-IN",
        "speaker": "priya",
    },
    {
        "filename": "hi-kabir-default.wav",
        "agent": "Kabir (Hindi AE)",
        "text": "नमस्कार जी, मैं कबीर बोल रहा हूँ। आपके हालिया टेक्नोलॉजी और डेटा पाइपलाइन रिक्वायरमेंट्स के बारे में बात करनी थी।",
        "lang": "hi-IN",
        "speaker": "aditya",
    },
    {
        "filename": "hi-kabir-competitor.wav",
        "agent": "Kabir (Hindi AE)",
        "text": "बिल्कुल, वे एक अच्छा टूल हैं। लेकिन हमारा सलूशन 99 प्रतिशत कॉलिंग एक्यूरेसी और भारतीय भाषाओं में रियल-टाइम ट्रांसक्रिप्शन देता है।",
        "lang": "hi-IN",
        "speaker": "aditya",
    },

    # Gujarati Agents
    {
        "filename": "gu-dhruv-default.wav",
        "agent": "Dhruv (Gujarati SME)",
        "text": "નમસ્તે! હું વ્યાપારી X થી ધ્રુવ વાત કરું છું. આપના ગોડાઉન ઇન્વેન્ટરી અને GST ઓટોમેશન અંગે 2 મિનિટ વાત કરી શકાય?",
        "lang": "gu-IN",
        "speaker": "aditya",
    },
    {
        "filename": "gu-pooja-default.wav",
        "agent": "Pooja (Gujarati Retail)",
        "text": "નમસ્કાર! હું પૂજા વ્યાપારી X થી બોલું છું. આપના બિઝનેસ માટે AI વોઇસ ડેમો માટે ફોન કર્યો છે.",
        "lang": "gu-IN",
        "speaker": "pooja",
    },

    # English Agents
    {
        "filename": "en-arjun-default.wav",
        "agent": "Arjun (Global SDR)",
        "text": "Hello! This is Arjun from VyaperiX. I noticed your recent expansion in enterprise sales automation.",
        "lang": "en-IN",
        "speaker": "aditya",
    },
]


async def main():
    api_key = get_sarvam_api_key()
    if not api_key:
        print("\n❌ SARVAM_API_KEY is not set in backend/.env!")
        print("Please add SARVAM_API_KEY=your_key to backend/.env and re-run.\n")
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"\n🚀 Generating {len(SAMPLE_PHRASES)} Sarvam AI Voice Samples into:\n   {OUTPUT_DIR}\n")

    for item in SAMPLE_PHRASES:
        out_path = OUTPUT_DIR / item["filename"]
        print(f"🎙️ Synthesizing: {item['agent']} -> {item['filename']}...")

        result = await synthesize_speech(
            text=item["text"],
            language=item["lang"],
            speaker=item["speaker"],
            api_key=api_key,
        )

        if result.get("success") and result.get("audio_b64"):
            audio_bytes = base64.b64decode(result["audio_b64"])
            with open(out_path, "wb") as f:
                f.write(audio_bytes)
            print(f"   ✓ Saved {len(audio_bytes)} bytes to {item['filename']}")
        else:
            print(f"   ⚠️ Failed: {result.get('error')}")

    print("\n✅ Generation complete! These static audio files will serve unlimited landing page visitors at $0 cost.\n")


if __name__ == "__main__":
    asyncio.run(main())
