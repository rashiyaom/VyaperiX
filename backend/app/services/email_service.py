"""
email_service.py — Enterprise Email Notification Engine for VyaperiX.

Features:
- Automated Greeting & Onboarding Email dispatch to registered user email.
- Automated Meeting Confirmation Email with live meeting link (Google Meet / Jitsi Live Video)
  dispatched to registered sales rep / account owner and optionally to prospect/customer.
- Robust SMTP integration (supports Gmail, Outlook, Brevo, SendGrid, Amazon SES, or custom SMTP).
- Graceful Mock Mode: If SMTP credentials are not configured, prints [MOCK EMAIL] and logs details
  without throwing errors or failing workflows (identical to sms_service.py).
"""

import asyncio
from datetime import datetime, timezone
import email.utils
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import logging
import os
import smtplib
from typing import Any, Dict, List, Optional
from dotenv import load_dotenv

from app.core import database as db

load_dotenv()
logger = logging.getLogger("vyepari.email")

# ─────────────────────────── SMTP Configuration ─────────────────────────────

def get_smtp_config() -> dict:
    """Return active SMTP configuration from environment."""
    load_dotenv(override=True)
    host = os.getenv("SMTP_HOST", "smtp.gmail.com").strip()
    port_raw = os.getenv("SMTP_PORT", "587").strip()
    try:
        port = int(port_raw)
    except (ValueError, TypeError):
        port = 587

    user = (os.getenv("SMTP_USER") or os.getenv("EMAIL_USER") or "").strip()
    password = (os.getenv("SMTP_PASS") or os.getenv("SMTP_PASSWORD") or os.getenv("EMAIL_PASS") or "").strip()
    from_name = os.getenv("SMTP_FROM_NAME", "VyaperiX AI").strip()
    from_email = (os.getenv("SMTP_FROM_EMAIL") or user or "notifications@vyaperix.ai").strip()
    secure = os.getenv("SMTP_SECURE", "starttls").strip().lower()
    mock_mode = os.getenv("EMAIL_MOCK_MODE", "").lower() in ("true", "1", "yes")

    is_configured = bool(user and password and not mock_mode)

    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "from_name": from_name,
        "from_email": from_email,
        "secure": secure,
        "is_configured": is_configured,
        "mock_mode": not is_configured,
    }


# ─────────────────────────── User Email Resolution ─────────────────────────

async def resolve_user_registered_email(user_id: Optional[str]) -> Optional[str]:
    """
    Resolve the user's registered login / signup email address.
    Hierarchy:
    1. MongoDB profile.email
    2. MongoDB profile.settings.alert_email
    3. voice_settings.alert_email
    4. Environment variable DEFAULT_REP_EMAIL or SMTP_USER
    """
    if user_id:
        try:
            profile = await db.get_profile(user_id)
            if profile:
                if profile.get("email") and str(profile["email"]).strip():
                    return str(profile["email"]).strip()
                if isinstance(profile.get("settings"), dict) and profile["settings"].get("alert_email"):
                    return str(profile["settings"]["alert_email"]).strip()
        except Exception as e:
            logger.warning(f"Error fetching profile email for user {user_id}: {e}")

    try:
        settings_doc = await db.get_voice_settings()
        if settings_doc and settings_doc.get("alert_email"):
            return str(settings_doc.get("alert_email")).strip()
    except Exception:
        pass

    fallback = os.getenv("DEFAULT_REP_EMAIL") or os.getenv("SMTP_USER")
    return fallback.strip() if fallback else None


async def resolve_workspace_owner_email(user_id: Optional[str] = None) -> Optional[str]:
    """
    Resolve the workspace/account owner's email address.
    Hierarchy:
    1. Environment variable OWNER_EMAIL or ADMIN_EMAIL
    2. Explicit user profile if user has role == 'owner'
    3. Any user in MongoDB profiles collection with role == 'owner'
    4. First registered user in MongoDB profiles collection
    5. Fallback to resolve_user_registered_email(user_id)
    """
    env_owner = os.getenv("OWNER_EMAIL") or os.getenv("ADMIN_EMAIL")
    if env_owner and "@" in env_owner:
        return env_owner.strip()

    if user_id:
        try:
            profile = await db.get_profile(user_id)
            if profile and profile.get("email"):
                if profile.get("role") == "owner":
                    return str(profile["email"]).strip()
        except Exception as e:
            logger.debug(f"Error checking owner profile for user {user_id}: {e}")

    try:
        owner_doc = await db.get_workspace_owner_profile()
        if owner_doc and owner_doc.get("email"):
            return str(owner_doc["email"]).strip()
    except Exception as e:
        logger.debug(f"Error fetching workspace owner profile: {e}")

    return await resolve_user_registered_email(user_id)


# ─────────────────────────── Core Dispatcher ────────────────────────────────

def _send_smtp_sync(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None,
    from_name: Optional[str] = None,
) -> dict:
    """Synchronous SMTP sending logic, executed in a background worker thread."""
    config = get_smtp_config()

    if config["mock_mode"] or not config["is_configured"]:
        logger.info(f"[MOCK EMAIL] To: {to_email} | Subject: {subject}")
        print(f"\n[MOCK EMAIL DISPATCH]\nTo: {to_email}\nSubject: {subject}\nSnippet: {text_content[:180] if text_content else html_content[:180]}...\n")
        return {
            "status": "mocked",
            "to": to_email,
            "subject": subject,
            "message": "Mock email sent (configure SMTP_USER & SMTP_PASS in .env for live delivery)",
        }

    sender_name = from_name or config["from_name"]
    sender_email = config["from_email"]

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{sender_name} <{sender_email}>"
    msg["To"] = to_email
    msg["Date"] = email.utils.formatdate(localtime=True)
    msg["Message-ID"] = email.utils.make_msgid(domain="vyaperix.ai")

    # Plain text alternative
    plain_text = text_content or html_content
    part_text = MIMEText(plain_text, "plain", "utf-8")
    msg.attach(part_text)

    # HTML part
    part_html = MIMEText(html_content, "html", "utf-8")
    msg.attach(part_html)

    try:
        if config["secure"] == "ssl" or config["port"] == 465:
            server = smtplib.SMTP_SSL(config["host"], config["port"], timeout=12.0)
        else:
            server = smtplib.SMTP(config["host"], config["port"], timeout=12.0)
            server.ehlo()
            if config["secure"] == "starttls" or config["port"] in (587, 25):
                server.starttls()
                server.ehlo()

        server.login(config["user"], config["password"])
        server.sendmail(sender_email, [to_email], msg.as_string())
        server.quit()

        logger.info(f"Email successfully delivered to {to_email} via {config['host']}")
        return {
            "status": "sent",
            "to": to_email,
            "subject": subject,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as exc:
        logger.error(f"SMTP error sending to {to_email}: {exc}")
        return {
            "status": "failed",
            "error": str(exc),
            "to": to_email,
            "subject": subject,
        }


async def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None,
    from_name: Optional[str] = None,
) -> dict:
    """Asynchronous non-blocking wrapper for SMTP email dispatch."""
    if not to_email or "@" not in to_email:
        return {"status": "failed", "error": f"Invalid recipient email: '{to_email}'"}

    return await asyncio.to_thread(
        _send_smtp_sync,
        to_email=to_email,
        subject=subject,
        html_content=html_content,
        text_content=text_content,
        from_name=from_name,
    )


# ─────────────────────────── HTML Email Templates ────────────────────────────

def _render_greeting_html(user_name: str, to_email: str, company_name: Optional[str] = None) -> str:
    """Generate modern, responsive HTML greeting/welcome email."""
    dashboard_url = os.getenv("FRONTEND_URL", "http://localhost:8080")
    year = datetime.now().year
    name_display = user_name or "Partner"
    workspace_info = f" • Workspace: <strong>{company_name}</strong>" if company_name else ""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to VyaperiX</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0d13; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b0d13; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #12151e; border: 1px solid #27272a; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.6);">
          <!-- Top Accent Bar -->
          <tr>
            <td height="4" style="background: linear-gradient(90deg, #7c3aed, #a855f7, #06b6d4);"></td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding: 32px 36px 20px 36px;">
              <table role="presentation" width="100%">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 900; letter-spacing: 1px; color: #ffffff; text-transform: uppercase;">VYAPERI<span style="color: #a855f7;">X</span></span>
                    <span style="display: block; font-size: 11px; color: #a1a1aa; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 4px;">Autonomous Commercial Intelligence</span>
                  </td>
                  <td align="right">
                    <span style="background-color: rgba(124, 58, 237, 0.15); border: 1px solid rgba(124, 58, 237, 0.4); color: #c084fc; font-size: 10px; font-weight: 700; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px;">Account Active</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero Body -->
          <tr>
            <td style="padding: 10px 36px 30px 36px;">
              <h1 style="font-size: 24px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0; line-height: 1.3;">
                Welcome to the Fleet, {name_display}! 👋
              </h1>
              <p style="font-size: 14px; line-height: 1.6; color: #d4d4d8; margin: 0 0 20px 0;">
                Your VyaperiX workspace is fully initialized and securely linked to your registered login email: 
                <strong style="color: #a855f7;">{to_email}</strong>{workspace_info}.
              </p>
              <p style="font-size: 13px; line-height: 1.6; color: #a1a1aa; margin: 0 0 26px 0;">
                You now have full access to our autonomous sales intelligence engine, multimodal website scraping, AI voice calling fleet, and automated meeting scheduling.
              </p>

              <!-- Highlights Box -->
              <table role="presentation" width="100%" style="background-color: #181b26; border: 1px solid #27272a; border-radius: 8px; margin-bottom: 28px;">
                <tr>
                  <td style="padding: 18px 20px;">
                    <div style="font-size: 11px; font-weight: 800; color: #a1a1aa; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">What You Can Do Today</div>
                    
                    <div style="margin-bottom: 10px; font-size: 13px; color: #e4e4e7;">
                      <span style="color: #a855f7; font-weight: bold; margin-right: 6px;">⚡</span> 
                      <strong>Market Radar & Scraper:</strong> Deep-crawl company websites, analyze competitors & products.
                    </div>
                    
                    <div style="margin-bottom: 10px; font-size: 13px; color: #e4e4e7;">
                      <span style="color: #06b6d4; font-weight: bold; margin-right: 6px;">📞</span> 
                      <strong>Autonomous AI Voice Calls:</strong> Outbound AI sales SDRs that converse in English and Hindi.
                    </div>

                    <div style="margin-bottom: 10px; font-size: 13px; color: #10b981; font-weight: bold;">
                      <span style="color: #10b981; margin-right: 6px;">📅</span> 
                      <span style="color: #e4e4e7; font-weight: normal;"><strong>Automated Meeting Booking:</strong> Auto-extracts calendar agreements and sends meeting links via SMS & Email.</span>
                    </div>

                    <div style="font-size: 13px; color: #e4e4e7;">
                      <span style="color: #f59e0b; font-weight: bold; margin-right: 6px;">💬</span> 
                      <strong>Floating Intelligence Chat:</strong> Interrogate scraped websites and enterprise reports in real-time.
                    </div>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="border-radius: 8px; background: linear-gradient(135deg, #7c3aed, #9333ea);">
                    <a href="{dashboard_url}" target="_blank" style="font-size: 13px; font-weight: 700; color: #ffffff; text-decoration: none; padding: 14px 28px; display: inline-block; letter-spacing: 0.5px; border-radius: 8px; text-transform: uppercase;">
                      Launch VyaperiX Dashboard →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 36px; background-color: #0d0f17; border-top: 1px solid #27272a; text-align: center;">
              <p style="font-size: 11px; color: #71717a; margin: 0 0 6px 0;">
                Sent to <span style="color: #a1a1aa;">{to_email}</span> because you registered an account on VyaperiX.
              </p>
              <p style="font-size: 10px; color: #52525b; margin: 0;">
                © {year} VyaperiX Inc. All rights reserved. • High-Precision Commercial Intelligence
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def _render_meeting_html(
    lead_name: str,
    meeting_time: str,
    meeting_link: str,
    title: str = "Discovery & Solution Demo",
    agenda: str = "",
    customer_phone: Optional[str] = None,
    prospect_email: Optional[str] = None,
    company_name: Optional[str] = None,
    recipient_type: str = "owner",  # "owner" | "rep" | "customer"
    source: str = "calendar",
) -> str:
    """Generate high-impact, responsive HTML meeting confirmation email."""
    year = datetime.now().year
    safe_link = meeting_link or "https://meet.jit.si/VyaperiX-Live-Demo"
    company_display = company_name or "VyaperiX Enterprise"

    if recipient_type == "owner":
        target_role = "Executive Owner Alert"
        badge_text = "✓ Owner Notified"
        badge_style = "background-color: rgba(124, 58, 237, 0.2); border: 1px solid rgba(124, 58, 237, 0.5); color: #c084fc;"
        accent_bar = "background: linear-gradient(90deg, #7c3aed, #a855f7, #10b981);"
        hero_heading = f"📅 Meeting Booked on {meeting_time} with {lead_name}"
        intro_paragraph = (
            f"A new meeting has been confirmed for <strong>{meeting_time}</strong> with <strong>{lead_name}</strong>. "
            f"The meeting has been synchronized with your VyaperiX calendar."
        )
        button_text = "🎥 Join Live Video Meeting Room as Host →"
    elif recipient_type == "rep":
        target_role = "Sales Representative Briefing"
        badge_text = "✓ Confirmed"
        badge_style = "background-color: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #34d399;"
        accent_bar = "background: linear-gradient(90deg, #10b981, #06b6d4, #7c3aed);"
        hero_heading = f"🔥 New Hot Lead Meeting Booked: {lead_name}"
        intro_paragraph = (
            f"A sales discovery meeting with <strong>{lead_name}</strong> has been confirmed for <strong>{meeting_time}</strong>. "
            f"The details have been synchronized with your VyaperiX calendar."
        )
        button_text = "🎥 Join Live Video Meeting Room →"
    else:
        target_role = "Client Meeting Confirmation"
        badge_text = "✓ Confirmed"
        badge_style = "background-color: rgba(6, 182, 212, 0.15); border: 1px solid rgba(6, 182, 212, 0.4); color: #38bdf8;"
        accent_bar = "background: linear-gradient(90deg, #06b6d4, #3b82f6, #10b981);"
        hero_heading = f"Meeting Confirmed: {title}"
        intro_paragraph = (
            f"Your meeting with <strong>{company_display}</strong> is confirmed for <strong>{meeting_time}</strong>. "
            f"We look forward to speaking with you at the scheduled time."
        )
        button_text = "🎥 Join Live Video Meeting Room →"

    agenda_html = f"""
    <tr style="border-top: 1px solid #27272a;">
      <td style="padding: 10px 0; font-size: 12px; color: #a1a1aa;">Agenda / Notes:</td>
      <td style="padding: 10px 0; font-size: 13px; color: #e4e4e7; font-weight: 500;">{agenda}</td>
    </tr>
    """ if agenda else ""

    phone_html = f"""
    <tr style="border-top: 1px solid #27272a;">
      <td style="padding: 10px 0; font-size: 12px; color: #a1a1aa;">Phone Number:</td>
      <td style="padding: 10px 0; font-size: 13px; color: #e4e4e7; font-weight: 500;">{customer_phone}</td>
    </tr>
    """ if customer_phone else ""

    email_html = f"""
    <tr style="border-top: 1px solid #27272a;">
      <td style="padding: 10px 0; font-size: 12px; color: #a1a1aa;">Client Email:</td>
      <td style="padding: 10px 0; font-size: 13px; color: #e4e4e7; font-weight: 500;">{prospect_email}</td>
    </tr>
    """ if (prospect_email and recipient_type != "customer") else ""

    source_html = f"""
    <tr style="border-top: 1px solid #27272a;">
      <td style="padding: 10px 0; font-size: 12px; color: #a1a1aa;">Booking Origin:</td>
      <td style="padding: 10px 0; font-size: 12px; color: #a855f7; font-weight: 600;">{source.replace('_', ' ').title()}</td>
    </tr>
    """ if (source and recipient_type != "customer") else ""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Meeting Confirmed: {title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0d13; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b0d13; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #12151e; border: 1px solid #27272a; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.6);">
          <!-- Top Accent Bar -->
          <tr>
            <td height="4" style="{accent_bar}"></td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding: 30px 36px 20px 36px;">
              <table role="presentation" width="100%">
                <tr>
                  <td>
                    <span style="font-size: 18px; font-weight: 900; letter-spacing: 1px; color: #ffffff; text-transform: uppercase;">VYAPERI<span style="color: #10b981;">X</span> CALENDAR</span>
                    <span style="display: block; font-size: 10px; color: #a1a1aa; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 3px;">{target_role}</span>
                  </td>
                  <td align="right">
                    <span style="{badge_style} font-size: 10px; font-weight: 700; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px;">{badge_text}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 10px 36px 30px 36px;">
              <h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 12px 0; line-height: 1.3;">
                {hero_heading}
              </h1>
              <p style="font-size: 13.5px; line-height: 1.6; color: #d4d4d8; margin: 0 0 24px 0;">
                {intro_paragraph}
              </p>

              <!-- Meeting Details Card -->
              <table role="presentation" width="100%" style="background-color: #181b26; border: 1px solid #27272a; border-radius: 8px; margin-bottom: 26px; padding: 16px 20px;">
                <tr>
                  <td colspan="2" style="padding-bottom: 12px; font-size: 11px; font-weight: 800; color: #a1a1aa; text-transform: uppercase; letter-spacing: 1px;">
                    Meeting Details & Schedule
                  </td>
                </tr>
                <tr>
                  <td width="35%" style="padding: 6px 0; font-size: 12px; color: #a1a1aa;">Meeting Title:</td>
                  <td width="65%" style="padding: 6px 0; font-size: 13px; color: #ffffff; font-weight: 600;">{title}</td>
                </tr>
                <tr style="border-top: 1px solid #27272a;">
                  <td style="padding: 8px 0; font-size: 12px; color: #a1a1aa;">Scheduled Time:</td>
                  <td style="padding: 8px 0; font-size: 13.5px; color: #34d399; font-weight: 800; letter-spacing: 0.3px;">{meeting_time}</td>
                </tr>
                <tr style="border-top: 1px solid #27272a;">
                  <td style="padding: 8px 0; font-size: 12px; color: #a1a1aa;">Participant:</td>
                  <td style="padding: 8px 0; font-size: 13px; color: #ffffff; font-weight: 600;">{lead_name}</td>
                </tr>
                {phone_html}
                {email_html}
                {source_html}
                {agenda_html}
              </table>

              <!-- Big Action Button (Join Meeting Link) -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 18px;">
                <tr>
                  <td align="center" style="border-radius: 8px; background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);">
                    <a href="{safe_link}" target="_blank" style="font-size: 13.5px; font-weight: 800; color: #ffffff; text-decoration: none; padding: 15px 32px; display: inline-block; letter-spacing: 0.5px; border-radius: 8px; text-transform: uppercase;">
                      {button_text}
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Direct URL Fallback -->
              <p style="font-size: 11px; color: #71717a; text-align: center; margin: 0 0 16px 0;">
                Direct Meeting Link: <a href="{safe_link}" target="_blank" style="color: #38bdf8; text-decoration: underline;">{safe_link}</a>
              </p>

              <div style="background-color: rgba(24, 27, 38, 0.7); border-left: 3px solid #7c3aed; padding: 10px 14px; border-radius: 4px;">
                <p style="font-size: 11px; line-height: 1.5; color: #a1a1aa; margin: 0;">
                  💡 <strong>Tip:</strong> Join directly from any browser (Chrome, Edge, Safari, Firefox). Camera, microphone, and screen share are fully supported without software downloads.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 36px; background-color: #0d0f17; border-top: 1px solid #27272a; text-align: center;">
              <p style="font-size: 11px; color: #71717a; margin: 0 0 4px 0;">
                VyaperiX Autonomous Commercial Operations
              </p>
              <p style="font-size: 10px; color: #52525b; margin: 0;">
                © {year} VyaperiX Inc. • Automated Sales Fleet & Scheduling System
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


# ─────────────────────────── High-Level APIs ────────────────────────────────

async def send_greeting_email(
    to_email: str,
    user_name: Optional[str] = None,
    company_name: Optional[str] = None,
) -> dict:
    """
    Dispatch welcome greeting email to the registered login/signup email address.
    """
    if not to_email:
        return {"status": "failed", "error": "No recipient email provided"}

    display_name = user_name or to_email.split("@")[0].capitalize()
    subject = f"Welcome to VyaperiX, {display_name}! 🚀 Your AI Sales Fleet is Ready"
    html = _render_greeting_html(user_name=display_name, to_email=to_email, company_name=company_name)
    plain_text = (
        f"Welcome to VyaperiX, {display_name}!\n\n"
        f"Your workspace is ready and linked to: {to_email}.\n"
        f"Explore Market Radar, Autonomous Voice Calls, and Automated Meeting Scheduling.\n\n"
        f"Launch Dashboard: {os.getenv('FRONTEND_URL', 'http://localhost:8080')}\n"
    )

    return await send_email(
        to_email=to_email,
        subject=subject,
        html_content=html,
        text_content=plain_text,
    )


async def send_meeting_email(
    rep_email: Optional[str],
    prospect_email: Optional[str],
    lead_name: str,
    meeting_time: str,
    meeting_link: str,
    title: str = "Sales Discovery Meeting",
    agenda: str = "",
    customer_phone: Optional[str] = None,
    company_name: Optional[str] = None,
    send_to_prospect: bool = False,
    owner_email: Optional[str] = None,
    user_id: Optional[str] = None,
    source: str = "calendar",
) -> dict:
    """
    Dispatch meeting booking confirmation emails:
    1. Sent to workspace owner (owner_email): "Meeting is booked on [date] and [time]".
    2. Sent to rep_email (if distinct from owner).
    3. Optionally sent to prospect_email if provided and send_to_prospect is True.
    """
    results: Dict[str, Any] = {"owner": None, "rep": None, "prospect": None}

    # Resolve owner email if not explicitly provided
    resolved_owner = owner_email
    if not resolved_owner:
        resolved_owner = await resolve_workspace_owner_email(user_id)

    # 1. Dispatch to Workspace Owner: "Meeting is booked on this date and time"
    if resolved_owner and "@" in resolved_owner:
        owner_subject = f"📅 [Owner Alert] Meeting Booked on {meeting_time} with {lead_name} — {title}"
        owner_html = _render_meeting_html(
            lead_name=lead_name,
            meeting_time=meeting_time,
            meeting_link=meeting_link,
            title=title,
            agenda=agenda,
            customer_phone=customer_phone,
            prospect_email=prospect_email,
            company_name=company_name,
            recipient_type="owner",
            source=source,
        )
        owner_text = (
            f"EXECUTIVE OWNER ALERT: MEETING BOOKED\n"
            f"Scheduled Date & Time: {meeting_time}\n"
            f"Participant / Lead: {lead_name}\n"
            f"Meeting Title: {title}\n"
            f"Customer Phone: {customer_phone or 'N/A'}\n"
            f"Customer Email: {prospect_email or 'N/A'}\n"
            f"Live Video Meeting Link: {meeting_link}\n"
            f"Agenda: {agenda or 'Sales exploration and product demonstration.'}\n"
            f"Source: {source}\n"
        )
        results["owner"] = await send_email(
            to_email=resolved_owner,
            subject=owner_subject,
            html_content=owner_html,
            text_content=owner_text,
        )
    else:
        results["owner"] = {"status": "skipped", "reason": "No valid owner_email resolved"}

    # 2. Dispatch to Sales Rep / Assignee (if distinct from owner)
    if rep_email and "@" in rep_email:
        if resolved_owner and rep_email.strip().lower() == resolved_owner.strip().lower():
            # Same recipient as owner
            results["rep"] = results.get("owner")
        else:
            rep_subject = f"🔥 Meeting Booked on {meeting_time} with {lead_name} ({title})"
            rep_html = _render_meeting_html(
                lead_name=lead_name,
                meeting_time=meeting_time,
                meeting_link=meeting_link,
                title=title,
                agenda=agenda,
                customer_phone=customer_phone,
                prospect_email=prospect_email,
                company_name=company_name,
                recipient_type="rep",
                source=source,
            )
            rep_text = (
                f"HOT LEAD MEETING BOOKED: {lead_name}\n"
                f"Scheduled Time: {meeting_time}\n"
                f"Topic: {title}\n"
                f"Phone: {customer_phone or 'N/A'}\n"
                f"Email: {prospect_email or 'N/A'}\n"
                f"Join Video Meeting Link: {meeting_link}\n"
                f"Agenda: {agenda or 'Sales exploration and product demonstration.'}\n"
            )
            results["rep"] = await send_email(
                to_email=rep_email,
                subject=rep_subject,
                html_content=rep_html,
                text_content=rep_text,
            )
    else:
        results["rep"] = {"status": "skipped", "reason": "No valid rep_email provided"}

    # 3. Optionally dispatch client confirmation to Prospect
    if send_to_prospect and prospect_email and "@" in prospect_email:
        prospect_subject = f"Meeting Confirmed: {title} with {company_name or 'VyaperiX'}"
        prospect_html = _render_meeting_html(
            lead_name=lead_name,
            meeting_time=meeting_time,
            meeting_link=meeting_link,
            title=title,
            agenda=agenda,
            customer_phone=customer_phone,
            prospect_email=prospect_email,
            company_name=company_name,
            recipient_type="customer",
            source=source,
        )
        prospect_text = (
            f"Hi {lead_name},\n\n"
            f"Your meeting with {company_name or 'VyaperiX'} is confirmed for {meeting_time}.\n\n"
            f"Join Live Video Meeting: {meeting_link}\n"
            f"Topic: {title}\n\n"
            f"We look forward to speaking with you!"
        )
        results["prospect"] = await send_email(
            to_email=prospect_email,
            subject=prospect_subject,
            html_content=prospect_html,
            text_content=prospect_text,
        )

    return results
