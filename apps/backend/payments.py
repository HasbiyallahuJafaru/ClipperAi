"""Buying 30 days of a plan through the ZoomGuru Payment API (Paystack underneath). Prices are shown in USD,
charged in Naira: the kobo amount is fixed here at initialize time from the live USD->NGN rate and can't be changed
by the browser. Nothing is stored about the customer's card and nothing charges itself: near the end of the 30 days
the plan shows "Renew" and the customer pays again.

The only code that activates a plan is apply(): its `applied_at is null` update runs once per reference, so duplicate
webhooks and reconciliation can't grant the month twice. The signed webhook is trusted, but reconcile() re-verifies
pending payments with the API so a missed callback heals itself."""
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.request
from datetime import timedelta

from typing import Literal

import billing
import db
from pydantic import BaseModel


class Checkout(BaseModel):
    plan: Literal["creator", "pro", "business"]
    email: str  # Paystack requires one and sends its receipt there; the Clerk token doesn't carry it


API = "https://zoomguru-backend-production.up.railway.app"  # test_jobs.py points this at fake_payments.py
RATE_API = "https://open.er-api.com/v6/latest/USD"  # free, no key; test_jobs.py points this at a local fake
FALLBACK_RATE = 1600.0  # until the first live fetch succeeds (and the seed row in migrations/007_payments.sql)
DAYS = timedelta(days=30)
STALE = timedelta(minutes=15)  # a pending payment older than this gets re-verified by reconcile()


class PaymentError(Exception):
    """Why a payment can't start, written for people. `status` is the HTTP status the API answers with."""

    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def call(method: str, path: str, body: dict | None = None) -> dict:
    key = os.environ.get("PAYMENT_API_KEY", "")
    request = urllib.request.Request(API + path, None if body is None else json.dumps(body).encode(), {
        "Content-Type": "application/json", "x-api-key": key})
    request.get_method = lambda: method
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise PaymentError("The payment provider didn't accept our API key.", 502) from e
        raise PaymentError(f"The payment provider said no ({e.code}). Try again in a minute.", 502) from e
    except (OSError, ValueError) as e:
        raise PaymentError("Couldn't reach the payment provider. Try again in a minute.", 502) from e


def rate() -> float:
    """The live USD->NGN rate, refreshed at most once a day. On a fetch failure the last good rate stays in use."""
    with db.connect() as c:
        row = c.execute("select * from fx_rate where id = 1").fetchone()
        if row and time.time() - row["at"].timestamp() < 24 * 3600:
            return float(row["rate"])
        try:
            with urllib.request.urlopen(RATE_API, timeout=15) as response:
                live = float(json.load(response)["rates"]["NGN"])
        except (OSError, KeyError, ValueError):
            return float(row["rate"]) if row else FALLBACK_RATE
        c.execute("update fx_rate set rate = %s, at = now() where id = 1", (live,))
        return live


def checkout(owner: str, email: str, plan: str) -> dict:
    """Price the plan server-side and start a hosted checkout. Returns what the caller is charged, plus the
    Paystack page to send them to. The payment is `pending` until apply() — nothing is granted here.
    PUBLIC_API_URL is this backend's public home (the provider's webhook must reach it directly, not through the
    website's signed-in proxy); WEBSITE_URL is where the customer's browser comes back to."""
    usd_cents, ngn = billing.PLANS[plan]["price_cents"], rate()
    kobo = round(usd_cents * ngn)  # price_cents is USD cents: * 100 for dollars, * 100 for kobo cancels out
    reply = call("POST", "/payment-api/payments/initialize", {
        "external_customer_id": owner, "email": email, "amount": kobo, "currency": "NGN", "plan": plan,
        # card-only and NGN-only are enforced server-side by the provider (channels field removed per their notice)
        "notification_url": f"{os.environ.get('PUBLIC_API_URL', 'http://127.0.0.1:8000')}/api/payments/callback",
        "callback_url": f"{os.environ.get('WEBSITE_URL', 'http://127.0.0.1:3000')}/checkout/return"})
    with db.connect() as c:
        c.execute("insert into payments (reference, owner, plan, email, usd_cents, kobo, rate)"
                  " values (%s, %s, %s, %s, %s, %s, %s)",
                  (reply["reference"], owner, plan, email, usd_cents, kobo, ngn))
    return {"reference": reply["reference"], "authorization_url": reply["authorization_url"],
            "usd_cents": usd_cents, "kobo": kobo, "rate": ngn}


def signed(raw: bytes, header: str) -> bool:
    key = os.environ.get("PAYMENT_API_KEY", "")
    if not key:
        return False  # no key configured: an empty-key HMAC is computable by anyone, so trust no webhook
    expected = hmac.new(key.encode(), raw, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, header)


def apply(reference: str) -> bool:
    """Activate a paid plan exactly once per reference: the update below only returns a row the first time.
    True if this call is the one that granted the 30 days."""
    with db.connect() as c, c.transaction():
        paid = c.execute("update payments set status = 'success', applied_at = now()"
                         " where reference = %s and applied_at is null returning *", (reference,)).fetchone()
        if paid is None:
            return False
        active = c.execute("select * from subscriptions where owner = %s and status = 'active' for update",
                           (paid["owner"],)).fetchone()
        # renewing the same plan stacks on the time left; switching plans starts fresh 30 days
        until = active["expires_at"] if active and active["plan"] == paid["plan"] else None
        c.execute("update subscriptions set status = 'ended', ended_at = now()"
                  " where owner = %s and status = 'active'", (paid["owner"],))
        c.execute("insert into subscriptions (owner, plan, price_cents, charged_cents, expires_at)"
                  # charged_cents is USD cents like the plan price; the actual NGN kobo charge is payments.kobo
                  " values (%s, %s, %s, %s, greatest(now(), coalesce(%s, now())) + interval '30 days')",
                  (paid["owner"], paid["plan"], paid["usd_cents"], paid["usd_cents"], until))
        return True


def reconcile():
    """The webhook is best-effort: re-verify pending payments the provider may have already collected."""
    with db.connect() as c:
        stale = c.execute("select reference from payments where status = 'pending' and created_at < now() - %s",
                          (STALE,)).fetchall()
    for row in stale:
        try:
            if call("POST", f"/payment-api/payments/{row['reference']}/verify")["status"] == "success":
                apply(row["reference"])
        except PaymentError:
            pass  # the next sweep tries again
