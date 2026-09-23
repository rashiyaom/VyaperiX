import express from "express";
import cors from "cors";
import pino from "pino";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const AUTH_DIR = path.join(__dirname, "auth_info");

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

let sock = null;
let currentQR = null;
let qrImageBase64 = null;
let isConnected = false;
let connectedUser = null;

const logger = pino({ level: "silent" });

async function initWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: true,
    auth: state,
    browser: ["VyaperiX AI Platform", "Chrome", "1.0.0"],
    syncFullHistory: false,
    generateHighQualityLinkPreview: true,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR = qr;
      try {
        qrImageBase64 = await QRCode.toDataURL(qr);
      } catch (err) {
        console.error("Error generating QR data URL:", err);
      }
      console.log("\n[WhatsApp Gateway] Scan the QR code below or visit http://localhost:" + PORT + "/qr in your browser:");
    }

    if (connection === "close") {
      isConnected = false;
      connectedUser = null;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(
        `[WhatsApp Gateway] Connection closed (code: ${statusCode}). Reconnecting: ${shouldReconnect}`
      );

      if (shouldReconnect) {
        setTimeout(initWhatsApp, 3000);
      } else {
        console.log("[WhatsApp Gateway] Logged out. Resetting auth directory...");
        try {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          fs.mkdirSync(AUTH_DIR, { recursive: true });
        } catch (e) {}
        setTimeout(initWhatsApp, 2000);
      }
    } else if (connection === "open") {
      isConnected = true;
      currentQR = null;
      qrImageBase64 = null;
      connectedUser = sock.user?.id?.split(":")[0] || sock.user?.name || "Connected Device";
      console.log(`\n======================================================`);
      console.log(`[WhatsApp Gateway] Successfully connected! Phone: ${connectedUser}`);
      console.log(`======================================================\n`);
    }
  });
}

function normalizeJid(phone) {
  let cleaned = String(phone || "").replace(/[^\d]/g, "");
  if (!cleaned) return null;
  // If standard 10 digit Indian number, prefix with 91
  if (cleaned.length === 10) {
    cleaned = "91" + cleaned;
  }
  return `${cleaned}@s.whatsapp.net`;
}

// ─────────────────────────── HTTP Endpoints ────────────────────────────

// Status & Health
app.get("/status", (req, res) => {
  res.json({
    status: isConnected ? "connected" : currentQR ? "awaiting_scan" : "initializing",
    connected: isConnected,
    phone_number: connectedUser,
    has_qr: Boolean(currentQR),
    qr_url: isConnected ? null : `http://localhost:${PORT}/qr`,
  });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, connected: isConnected, service: "VyaperiX WhatsApp Gateway" });
});

// QR Web Interface
app.get("/qr", (req, res) => {
  if (isConnected) {
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>VyaperiX WhatsApp Gateway</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0b141a; color: #e9edef; text-align: center; }
            .card { background: #111b21; padding: 40px; border-radius: 16px; border: 1px solid #222d34; max-width: 440px; box-shadow: 0 12px 30px rgba(0,0,0,0.5); }
            .icon { font-size: 64px; margin-bottom: 16px; }
            h1 { font-size: 22px; margin-bottom: 8px; color: #25d366; }
            p { color: #8696a0; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
            .badge { background: rgba(37,211,102,0.15); color: #25d366; padding: 8px 16px; border-radius: 20px; font-weight: 600; display: inline-block; font-size: 13px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">✅</div>
            <h1>WhatsApp Connected</h1>
            <p>Your WhatsApp device is linked and active. VyaperiX is ready to send automated call summaries and meeting confirmations.</p>
            <div class="badge">Device Phone: +${connectedUser}</div>
          </div>
        </body>
      </html>
    `);
  }

  if (!qrImageBase64) {
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>VyaperiX WhatsApp Gateway</title>
          <meta http-equiv="refresh" content="2">
          <style>
            body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0b141a; color: #e9edef; text-align: center; }
          </style>
        </head>
        <body>
          <div>
            <h2>Initializing WhatsApp Session...</h2>
            <p>Please wait 2-3 seconds for the QR code to generate.</p>
          </div>
        </body>
      </html>
    `);
  }

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Scan WhatsApp QR — VyaperiX</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="refresh" content="12">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0b141a; color: #e9edef; }
          .card { background: #111b21; padding: 36px; border-radius: 16px; border: 1px solid #222d34; max-width: 420px; text-align: center; box-shadow: 0 12px 30px rgba(0,0,0,0.5); }
          h1 { font-size: 20px; margin-bottom: 6px; }
          p { color: #8696a0; font-size: 13px; margin-bottom: 20px; line-height: 1.4; }
          .qr-box { background: white; padding: 16px; border-radius: 12px; display: inline-block; margin-bottom: 20px; }
          .qr-box img { width: 240px; height: 240px; display: block; }
          ol { text-align: left; font-size: 13px; color: #8696a0; padding-left: 20px; margin-bottom: 0; line-height: 1.6; }
          li b { color: #e9edef; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Link WhatsApp with VyaperiX</h1>
          <p>Scan this QR code from your phone to enable automated meeting and call recap messaging.</p>
          <div class="qr-box">
            <img src="${qrImageBase64}" alt="WhatsApp QR Code" />
          </div>
          <ol>
            <li>Open <b>WhatsApp</b> on your phone.</li>
            <li>Tap <b>Settings</b> or <b>Menu ⋮</b> &rarr; <b>Linked Devices</b>.</li>
            <li>Tap <b>Link a Device</b> and point camera at this screen.</li>
          </ol>
        </div>
      </body>
    </html>
  `);
});

// API QR Endpoint (Returns Base64 JSON for UI Embedding)
app.get("/api/qr", (req, res) => {
  res.json({
    connected: isConnected,
    phone_number: connectedUser,
    has_qr: Boolean(currentQR),
    qr_data_url: qrImageBase64,
    qr_url: isConnected ? null : `http://localhost:${PORT}/qr`,
  });
});

// Logout and Reset Credentials Endpoint
app.post("/api/logout", async (req, res) => {
  try {
    if (sock) {
      await sock.logout();
    }
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    isConnected = false;
    connectedUser = null;
    currentQR = null;
    qrImageBase64 = null;
    console.log("[WhatsApp Gateway] User requested logout. Reset session credentials.");
    setTimeout(() => {
      initWhatsApp().catch((err) => console.error("Error re-initializing:", err));
    }, 1000);
    return res.json({ success: true, message: "Logged out successfully. Reinitializing QR code." });
  } catch (err) {
    console.error("[WhatsApp Gateway] Error logging out:", err);
    return res.status(500).json({ success: false, error: err?.message || "Failed to logout." });
  }
});

// Send Message Endpoint
app.post("/api/send", async (req, res) => {
  const { phone, message } = req.body;

  if (!isConnected || !sock) {
    return res.status(503).json({
      success: false,
      error: "WhatsApp gateway is not connected. Please scan QR at /qr first.",
    });
  }

  if (!phone || !message) {
    return res.status(400).json({
      success: false,
      error: "Both 'phone' and 'message' are required.",
    });
  }

  const jid = normalizeJid(phone);
  if (!jid) {
    return res.status(400).json({
      success: false,
      error: `Invalid phone number '${phone}'. Must include country code or valid 10 digits.`,
    });
  }

  try {
    const result = await sock.sendMessage(jid, { text: message });
    console.log(`[WhatsApp Gateway] Message sent successfully to ${jid}`);
    return res.json({
      success: true,
      message_id: result?.key?.id,
      recipient: jid,
      sent_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[WhatsApp Gateway] Failed to send message to ${jid}:`, error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to send WhatsApp message.",
    });
  }
});

// Start Express server and initialize WhatsApp client
app.listen(PORT, () => {
  console.log(`[WhatsApp Gateway] HTTP Server running on http://localhost:${PORT}`);
  initWhatsApp().catch((err) => console.error("Error starting Baileys:", err));
});
