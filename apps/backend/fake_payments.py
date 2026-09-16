"""A stand-in for the ZoomGuru Payment API (Paystack underneath) that payments.py uses, for test_jobs.py. Keeps
payments in memory; `pay(reference)` acts out the customer completing checkout, so a later verify reports success —
exactly like the real service, where only Paystack's answer to verify is the source of truth."""
import hashlib
import hmac
import json
import secrets
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

KEY = "fake-payment-key"


class FakePayments:
    def __init__(self):
        self.records, self.paid, self.fail = {}, set(), None
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"]))) \
                    if int(self.headers.get("Content-Length") or 0) else None
                if self.headers.get("x-api-key") != KEY or fake.fail == "unauthorized":
                    return self.reply(401, {"message": "Invalid API key"})
                if fake.fail == "down":
                    return self.reply(503, {})
                parts = self.path.strip("/").split("/")
                if parts[-1] == "initialize":
                    record = {"reference": f"pay_app_b_{secrets.token_hex(16)}", "status": "pending",
                              "authorization_url": f"https://checkout.paystack.test/{secrets.token_hex(6)}", **body}
                    fake.records[record["reference"]] = record
                    return self.reply(201, {k: record[k] for k in
                                            ("reference", "authorization_url", "amount", "currency", "status")})
                if parts[-1] == "verify":
                    record = fake.records.get(parts[-2])
                    if record is None:
                        return self.reply(404, {"message": "Payment not found"})
                    if record["reference"] in fake.paid:  # Paystack says it was paid
                        record["status"] = "success"
                    return self.reply(200, record)

            def reply(self, status, body):
                data = json.dumps(body).encode()
                self.send_response(status)
                for name, value in {"Content-Type": "application/json", "Content-Length": len(data)}.items():
                    self.send_header(name, str(value))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_port}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def pay(self, reference: str):
        """The customer completes checkout on Paystack's page: the next verify (and webhook) reports success."""
        self.paid.add(reference)

    def callback(self, reference: str) -> tuple[bytes, str]:
        """The signed success webhook for a payment: the raw body and its x-zoomguru-signature header."""
        raw = json.dumps({"event": "payment.success", "reference": reference, "status": "success"}).encode()
        return raw, hmac.new(KEY.encode(), raw, hashlib.sha512).hexdigest()
