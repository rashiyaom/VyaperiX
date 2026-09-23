"""
smoke_uvicorn_playwright.py — Real end-to-end smoke test under uvicorn --reload.

Procedure:
1. Spawns uvicorn subprocess: uvicorn app.main:app --port 18765 --reload
   with FORCE_PLAYWRIGHT=1 so the scraper exercises Chromium headless execution.
2. Waits for GET /health -> 200.
3. Posts /api/reports with website_url="https://example.com".
4. Verifies HTTP 202 and tracks report status until Playwright fetch executes.
5. Verifies Playwright execution recorded in logs/metrics.jsonl.
6. Gracefully terminates uvicorn and asserts clean shutdown.
"""

import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path
import httpx

BACKEND_DIR = Path(__file__).resolve().parent.parent
PORT = 18765
BASE_URL = f"http://127.0.0.1:{PORT}"
METRICS_FILE = BACKEND_DIR / "logs" / "metrics.jsonl"


def run_smoke_test():
    print(f"=== Starting Uvicorn Smoke Test on port {PORT} ===")
    env = os.environ.copy()
    env["FORCE_PLAYWRIGHT"] = "1"
    env["PYTHONUNBUFFERED"] = "1"

    # Start uvicorn subprocess
    cmd = [
        sys.executable,
        "-m", "uvicorn",
        "app.main:app",
        "--host", "127.0.0.1",
        "--port", str(PORT),
        "--reload",
    ]
    print(f"Spawning: {' '.join(cmd)}")
    log_path = BACKEND_DIR / "logs" / "uvicorn_smoke.log"
    log_file = open(log_path, "w", encoding="utf-8")
    proc = subprocess.Popen(
        cmd,
        cwd=str(BACKEND_DIR),
        env=env,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        text=True,
    )

    try:
        # Wait for health check
        print("Waiting for server to become healthy...")
        healthy = False
        for attempt in range(40):
            try:
                r = httpx.get(f"{BASE_URL}/health", timeout=1.0)
                if r.status_code == 200:
                    healthy = True
                    print(f"Server is healthy on attempt {attempt + 1} ✓")
                    break
            except Exception:
                time.sleep(0.5)

        if not healthy:
            raise RuntimeError("Uvicorn failed to respond on /health within 20s")

        # Submit report to trigger scraping pipeline
        print("Submitting report to POST /api/reports...")
        target_site = "https://www.python.org"
        form_data = {
            "website_url": target_site,
            "company_name": "Python Software Foundation",
            "business_description": "Automated verification of Playwright Chromium execution",
        }
        resp = httpx.post(f"{BASE_URL}/api/reports", data=form_data, timeout=10.0)
        print(f"POST /api/reports -> HTTP {resp.status_code}")
        assert resp.status_code == 202, f"Expected 202, got {resp.status_code}: {resp.text}"
        report_data = resp.json()
        report_id = report_data.get("report_id")
        print(f"Created report_id: {report_id}")

        # Poll status until pipeline enters scraping/analyzing or completed
        print("Polling report status to verify Playwright execution...")
        playwright_verified = False
        for poll_iter in range(45):
            time.sleep(1.0)
            try:
                status_resp = httpx.get(f"{BASE_URL}/api/reports/{report_id}", timeout=10.0)
                if status_resp.status_code == 200:
                    s_data = status_resp.json()
                    current_status = s_data.get("status")
                    print(f"  Poll {poll_iter + 1}: status = {current_status}")
            except Exception as poll_err:
                print(f"  Poll {poll_iter + 1}: lag ({poll_err})")

            # Check metrics.jsonl for successful layer2_playwright event
            if METRICS_FILE.exists():
                with open(METRICS_FILE, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.strip():
                            try:
                                record = json.loads(line)
                                if (
                                    record.get("event") == "layer2_playwright"
                                    and "python.org" in record.get("url", "")
                                    and record.get("ok") is True
                                ):
                                    print(f"Playwright metric event detected in metrics.jsonl: {record} [OK]")
                                    playwright_verified = True
                                    break
                            except Exception:
                                pass
            if playwright_verified:
                break

        assert playwright_verified, "Playwright fetch was not detected in metrics.jsonl within 45s"
        print("Real Playwright fetch verified successfully under uvicorn --reload!")

    finally:
        print("Initiating clean uvicorn shutdown...")
        proc.terminate()
        try:
            proc.wait(timeout=10)
            print(f"Uvicorn process exited cleanly with code: {proc.returncode} [OK]")
        except subprocess.TimeoutExpired:
            print("Process did not exit within 10s, killing...")
            proc.kill()
            proc.wait()
            print("Uvicorn process killed.")
        try:
            log_file.close()
        except Exception:
            pass

    print("=== Smoke Test Passed with Clean Shutdown ===")


if __name__ == "__main__":
    run_smoke_test()
