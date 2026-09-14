"""Plans, the workspace's subscription and monthly usage limits. Every channel (website, MCP, Telegram) goes through
these checks; clients never enforce limits themselves.

Payments are switched off: choosing a plan activates it at once and nothing is charged (`charged_cents` stays 0)."""
from typing import Literal

from pydantic import BaseModel

import clipper
import db

# ponytail: one workspace until accounts exist (Phase 9); then subscriptions get a user id and these functions a user
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


def current() -> dict | None:
    with db.connect() as c:
        return c.execute("select * from subscriptions where status = 'active'").fetchone()


def usage() -> dict:
    """This calendar month: videos started (failed and cancelled ones don't count), minutes of video processed
    (speech length of completed projects, from their transcripts) and clips made."""
    # ponytail: calendar months; follow the payment provider's billing period once payments are real
    with db.connect() as c:
        return c.execute("""
            select count(*) filter (where p.status not in ('failed', 'cancelled')) as videos,
                   coalesce(sum((t.data->'segments'->-1->>'end')::float) filter (where p.status = 'completed'), 0) / 60
                       as minutes,
                   (select count(*) from clips join projects q on q.id = clips.project_id
                    where q.created_at >= date_trunc('month', now())) as clips
            from projects p left join transcripts t on t.source_key = p.source_key
            where p.created_at >= date_trunc('month', now())""").fetchone()


def allowance() -> dict:
    """What processing may still use this month: {"videos", "seconds", "clips"} (videos None = no cap).
    Raises LimitError without a plan or when the minutes or clips are used up."""
    # ponytail: projects running at the same time don't reserve allowance, so a month can overshoot by one video
    subscription = current()
    if subscription is None:
        raise LimitError("Choose a plan to start making clips.")
    plan, used = PLANS[subscription["plan"]], usage()
    left = {"videos": None if plan["videos"] is None else plan["videos"] - used["videos"],
            "seconds": (plan["minutes"] - used["minutes"]) * 60, "clips": plan["clips"] - used["clips"]}
    if left["seconds"] <= 0:
        raise LimitError(f"You've used all {plan['minutes'] // 60} hours of video in your {plan['name']} plan this"
                         " month.")
    if left["clips"] <= 0:
        raise LimitError(f"You've made all {plan['clips']} clips in your {plan['name']} plan this month.")
    return left


def check_new_project():
    """Raises LimitError unless the plan allows starting another project this month."""
    left = allowance()
    if left["videos"] is not None and left["videos"] <= 0:
        plan = PLANS[current()["plan"]]
        raise LimitError(f"You've started all {plan['videos']} videos in your {plan['name']} plan this month.")


def subscribe(plan: str) -> dict:
    """Start or switch to a plan. It replaces the current plan immediately; choosing the current plan changes nothing."""
    # ponytail: payments are off; when a provider is chosen, start its hosted checkout here and activate from its webhook
    with db.connect() as c, c.transaction():
        active = c.execute("select * from subscriptions where status = 'active' for update").fetchone()
        if active and active["plan"] == plan:
            return active
        c.execute("update subscriptions set status = 'ended', ended_at = now() where status = 'active'")
        return c.execute("insert into subscriptions (plan, price_cents) values (%s, %s) returning *",
                         (plan, PLANS[plan]["price_cents"])).fetchone()


def cancel() -> dict | None:
    """Ends the plan now (nothing was paid, so there's no period to run out). None if there is no plan."""
    with db.connect() as c:
        return c.execute("update subscriptions set status = 'ended', ended_at = now() where status = 'active'"
                         " returning *").fetchone()


def summary() -> dict:
    with db.connect() as c:
        history = c.execute("select * from subscriptions order by started_at desc limit 50").fetchall()
    return {"plans": [{"id": key, **plan} for key, plan in PLANS.items()], "subscription": current(),
            "usage": usage(), "history": history}
