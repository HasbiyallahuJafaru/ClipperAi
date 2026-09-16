"""Connecting a user's own Buffer account, so publishing happens through their channels and their request limits
instead of one workspace key (BUFFER_OWNERS). Standard OAuth 2 Authorization Code + PKCE against auth.buffer.com:
the browser comes back to the website's /oauth/return page, which hands the code here through the signed-in API
proxy. Buffer's refresh tokens are single-use and rotated on every refresh, so the stored one must be replaced
atomically or the account breaks. Direct platform APIs (linkedin, youtube, threads) can reuse this table later."""
import base64
import hashlib
import json
import os
import secrets
import urllib.error
import urllib.parse
import urllib.request
from datetime import timedelta

import db
from pydantic import BaseModel

AUTH = "https://auth.buffer.com"
MINUTES_AHEAD = 10  # refresh when the access token is this close to expiry (they last an hour)
STATE_TTL = timedelta(minutes=10)


class ConnectError(Exception):
    """Why connecting (or using a connection) failed, written for people. `status` is the HTTP status to answer with."""

    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


class Callback(BaseModel):
    state: str
    code: str


def state_owner(state: str) -> str | None:
    """Who started this connect attempt (and that it's still fresh) — the callback must be for the same account."""
    with db.connect() as c:
        row = c.execute("select owner from oauth_states where state = %s and created_at > now() - %s",
                        (state, STATE_TTL)).fetchone()
    return row and row["owner"]


def redirect_url() -> str:
    if url := os.environ.get("BUFFER_REDIRECT_URL"):
        return url
    return f"{os.environ.get('WEBSITE_URL', 'http://127.0.0.1:3000')}/oauth/return"


def _client():
    client_id, secret = os.environ.get("BUFFER_CLIENT_ID"), os.environ.get("BUFFER_CLIENT_SECRET")
    if not (client_id and secret):
        raise ConnectError("Buffer sign-in isn't set up yet: register the app in Buffer (Settings, then API) and set"
                           " BUFFER_CLIENT_ID and BUFFER_CLIENT_SECRET in the backend's .env.", 409)
    return client_id, secret


def _token_request(form: dict) -> dict:
    request = urllib.request.Request(f"{AUTH}/token", urllib.parse.urlencode(form).encode(),
                                     {"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as e:
        if e.code in (400, 401):
            detail = json.loads(e.read() or "{}").get("error", "")
            raise ConnectError("Buffer didn't accept the connection. Connect the account again.", 401) from e
        raise ConnectError("Couldn't reach Buffer. Try again in a minute.") from e
    except (OSError, ValueError) as e:
        raise ConnectError("Couldn't reach Buffer. Try again in a minute.") from e


def connect_url(owner: str, provider: str = "buffer") -> str:
    if provider != "buffer":
        raise ConnectError("Only Buffer connections are supported so far.", 404)
    client_id, _ = _client()
    verifier = secrets.token_urlsafe(48)
    state = secrets.token_urlsafe(24)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    with db.connect() as c:
        c.execute("delete from oauth_states where created_at < now() - %s", (STATE_TTL,))
        c.execute("insert into oauth_states (state, owner, provider, verifier) values (%s, %s, %s, %s)",
                  (state, owner, provider, verifier))
    query = urllib.parse.urlencode({
        "client_id": client_id, "redirect_uri": redirect_url(), "response_type": "code",
        "scope": "account:read posts:write offline_access", "state": state,
        "code_challenge": challenge, "code_challenge_method": "S256", "prompt": "consent"})
    return f"{AUTH}/auth?{query}"


def callback(state: str, code: str) -> dict:
    """Turns the browser's code into stored tokens. One-time: the state row is consumed either way, so a replayed
    callback fails. Returns the stored account."""
    with db.connect() as c, c.transaction():
        row = c.execute("delete from oauth_states where state = %s and created_at > now() - %s returning *",
                        (state, STATE_TTL)).fetchone()
        if row is None:
            raise ConnectError("This connection attempt has expired. Start again.", 422)
        client_id, secret = _client()
        tokens = _token_request({"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_url(),
                                 "client_id": client_id, "client_secret": secret,
                                 "code_verifier": row["verifier"]})
        account = c.execute("""
            insert into connected_accounts (owner, provider, account_id, account_name, access_token, refresh_token,
                                            expires_at)
            values (%s, %s, %s, %s, %s, %s, now() + make_interval(secs => %s))
            on conflict (owner, provider) do update set account_id = excluded.account_id,
                account_name = excluded.account_name, access_token = excluded.access_token,
                refresh_token = excluded.refresh_token, expires_at = excluded.expires_at, created_at = now()
            returning *""",
                            (row["owner"], row["provider"], _identity(tokens["access_token"]),
                             "Buffer", tokens["access_token"], tokens.get("refresh_token"),
                             tokens.get("expires_in", 3600))).fetchone()
    return {"id": account["id"], "provider": account["provider"], "account_name": account["account_name"]}


def _identity(token: str) -> str:
    """The connected organization, from the same query channels() already makes (so a fresh account with no
    channels still connects)."""
    import publishing
    orgs = publishing.call("{ account { organizations { id } } }", token=token)["account"]["organizations"]
    if not orgs:
        raise ConnectError("Buffer returned no organization for this account. Use a normal Buffer account.")
    return orgs[0]["id"]


def token_for(owner: str, provider: str = "buffer") -> str | None:
    """The owner's working access token: refreshed (and the single-use refresh token rotated) when close to expiry.
    None when there is no connection. A failed refresh removes it — reconnecting is the only fix."""
    with db.connect() as c:
        account = c.execute("select * from connected_accounts where owner = %s and provider = %s",
                            (owner, provider)).fetchone()
        if account is None or account["expires_at"] > _soon():
            return account and account["access_token"]
        client_id, secret = _client()
        try:
            tokens = _token_request({"grant_type": "refresh_token",
                                     "refresh_token": account["refresh_token"], "client_id": client_id,
                                     "client_secret": secret})
        except ConnectError:
            c.execute("delete from connected_accounts where id = %s", (account["id"],))
            raise ConnectError("Buffer disconnected your account. Connect it again to keep publishing.", 401)
        fresh = c.execute("""update connected_accounts set access_token = %s, refresh_token = %s,
                             expires_at = now() + make_interval(secs => %s) where id = %s returning access_token""",
                          (tokens["access_token"], tokens["refresh_token"], tokens.get("expires_in", 3600),
                           account["id"])).fetchone()
        return fresh["access_token"]


def _soon():
    import datetime
    return datetime.datetime.now(datetime.timezone.utc) + timedelta(minutes=MINUTES_AHEAD)


def connection(owner: str, provider: str = "buffer") -> dict | None:
    with db.connect() as c:
        return c.execute("select id, provider, account_name, created_at from connected_accounts"
                         " where owner = %s and provider = %s", (owner, provider)).fetchone()


def disconnect(owner: str, provider: str = "buffer") -> None:
    with db.connect() as c:
        c.execute("delete from connected_accounts where owner = %s and provider = %s", (owner, provider))
