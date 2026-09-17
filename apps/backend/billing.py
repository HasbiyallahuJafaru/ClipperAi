"""Plans, each account's subscription and monthly usage limits. Both channels (website, MCP) go through these checks;
clients never enforce limits themselves. `owner` is the Clerk organization or user id the request acts for.

Payments: each purchase buys 30 days through payments.py (ZoomGuru/Paystack); prices are shown in USD and charged
in Naira. Once a plan's 30 days run out it counts as no plan until the customer pays again."""
from typing import Literal
import os

from pydantic import BaseModel

import clipper
import db

# videos: projects started a month (None = no cap); minutes: of source video processed; clips: rendered
PLANS = {
    "creator": {"name": "Creator", "price_cents": 1500, "videos": 5, "minutes": 300, "clips": 50},
    "pro": {"name": "Pro", "price_cents": 3900, "videos": 15, "minutes": 900, "clips": 150},
    "business": {"name": "Business", "price_cents": 9900, "videos": None, "minutes": 3000, "clips": 500},
}


class LimitError(clipper.PermanentError):
    """No plan, or this month's allowance is used up. Permanent: retrying a job won't free up allowance."""


class Subscribe(BaseModel):
    plan: Literal["creator", "pro", "business"]


def current(owner: str) -> dict | None:
    with db.connect() as c:
        return c.execute("select * from subscriptions where owner = %s and status = 'active'"
                         " and (expires_at is null or expires_at > now())", (owner,)).fetchone()


def usage(owner: str) -> dict:
    """This calendar month: videos started (failed and cancelled ones don't count), minutes of video processed
    (speech length of completed projects, from their transcripts) and clips made."""
    # ponytail: calendar months; follow the payment provider's billing period once payments are real
    with db.connect() as c:
        return c.execute("""
            select count(*) filter (where p.status not in ('failed', 'cancelled')) as videos,
                   coalesce(sum((t.data->'segments'->-1->>'end')::float) filter (where p.status = 'completed'), 0) / 60
                       as minutes,
                   (select count(*) from clips join projects q on q.id = clips.project_id
                    where q.owner = %(owner)s and q.created_at >= date_trunc('month', now())) as clips
            from projects p left join transcripts t on t.source_key = p.source_key
            where p.owner = %(owner)s and p.created_at >= date_trunc('month', now())""", {"owner": owner}).fetchone()


def allowance(owner: str) -> dict:
    """What processing may still use this month: {"videos", "seconds", "clips", "plan"} (videos None = no cap).
    Raises LimitError without a plan or when the minutes or clips are used up."""
    # ponytail: projects running at the same time don't reserve allowance, so a month can overshoot by one video
    subscription = current(owner)
    if subscription is None:
        raise LimitError("Choose a plan to start making clips.")
    plan = PLANS[subscription["plan"]]
    used = usage(owner)
    left = {"videos": None if plan["videos"] is None else plan["videos"] - used["videos"],
            "seconds": (plan["minutes"] - used["minutes"]) * 60, "clips": plan["clips"] - used["clips"],
            "plan": plan}
    if left["seconds"] <= 0:
        raise LimitError(f"You've used all {plan['minutes'] // 60} hours of video in your {plan['name']} plan this"
                         " month.")
    if left["clips"] <= 0:
        raise LimitError(f"You've made all {plan['clips']} clips in your {plan['name']} plan this month.")
    return left


def check_new_project(owner: str):
    """Raises LimitError unless the plan allows starting another project this month."""
    if (left := allowance(owner))["videos"] is not None and left["videos"] <= 0:
        raise LimitError(f"You've started all {left['plan']['videos']} videos in your {left['plan']['name']} plan"
                         " this month.")


def subscribe(owner: str, plan: str) -> dict:
    """Activate a plan directly — the free path used while payments are off (no PAYMENT_API_KEY) and by tests.
    With a payment key set, plans only ever activate through payments.apply()."""
    if os.environ.get("PAYMENT_API_KEY"):
        raise LimitError("Choose a plan on the pricing page to pay for it.")
    with db.connect() as c, c.transaction():
        active = c.execute("select * from subscriptions where owner = %s and status = 'active' for update",
                           (owner,)).fetchone()
        if active and active["plan"] == plan:
            return active
        c.execute("update subscriptions set status = 'ended', ended_at = now() where owner = %s and status = 'active'",
                  (owner,))
        return c.execute("insert into subscriptions (owner, plan, price_cents) values (%s, %s, %s) returning *",
                         (owner, plan, PLANS[plan]["price_cents"])).fetchone()


def cancel(owner: str) -> dict | None:
    """Ends the plan now, for good (a paid month doesn't refund; the 30 days are simply given up). None if none."""
    with db.connect() as c:
        return c.execute("update subscriptions set status = 'ended', ended_at = now()"
                         " where owner = %s and status = 'active' returning *", (owner,)).fetchone()


def summary(owner: str) -> dict:
    """One connection for the whole summary instead of three (pool aside, each connect is a round trip)."""
    with db.connect() as c:
        history = c.execute("select * from subscriptions where owner = %s order by started_at desc limit 50",
                            (owner,)).fetchall()
        subscription = c.execute("select * from subscriptions where owner = %s and status = 'active'"
                                 " and (expires_at is null or expires_at > now())", (owner,)).fetchone()
        usage = c.execute("""
            select count(*) filter (where p.status not in ('failed', 'cancelled')) as videos,
                   coalesce(sum((t.data->'segments'->-1->>'end')::float) filter (where p.status = 'completed'), 0) / 60
                       as minutes,
                   (select count(*) from clips join projects q on q.id = clips.project_id
                        where q.owner = %(owner)s and q.created_at >= date_trunc('month', now())) as clips
            from projects p left join transcripts t on t.source_key = p.source_key
            where p.owner = %(owner)s and p.created_at >= date_trunc('month', now())""", {"owner": owner}).fetchone()
    return {"plans": [{"id": key, **plan} for key, plan in PLANS.items()], "subscription": subscription,
            "usage": usage, "history": history}
