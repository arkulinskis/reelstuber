"""Admin page callables: overview, users (make admin, disable), demo data. Admins only.
Feedback admin calls live in Feedback.py."""
import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables
import datetime as dt

from . import common as C
from . import DemoData, Feedback


@anvil.server.callable(require_user=True)
def admin_overview():
    C.require_admin()
    return {"users": len([u for u in app_tables.users.search() if not u["is_demo"]]),
            "admins": len(app_tables.users.search(is_admin=True)),
            "feedback_new": Feedback.new_count(),
            "projects": len([p for p in app_tables.projects.search() if not p["is_demo"]]),
            "clips": len([c for c in app_tables.clips.search() if not c["is_demo"]]),
            "exports": len([e for e in app_tables.exports.search() if not e["is_demo"]]),
            "templates": len([t for t in app_tables.templates.search() if not t["is_demo"]]),
            "demo": {"state": DemoData.state(), "counts": DemoData.counts()}}


def _user(u):
    return {"id": u.get_id(), "email": u["email"], "name": C.name_of(u), "is_admin": C.is_admin(u),
            "enabled": u["enabled"] is not False, "joined": C.iso(u["signed_up"]), "last_seen": C.iso(u["last_seen"])}


@anvil.server.callable(require_user=True)
def list_users(query=None):
    C.require_admin()
    query = C.text(query, 80).lower()
    rows = [u for u in app_tables.users.search(tables.order_by("signed_up", ascending=False)) if not u["is_demo"]]
    if query:
        rows = [u for u in rows if query in (u["email"] or "").lower() or query in (u["display_name"] or "").lower()]
    return {"users": [_user(u) for u in rows[:200]], "total": len(rows)}


@anvil.server.callable(require_user=True)
def set_admin(user_id, flag):
    me = C.require_admin()
    u = C.row_by_id(app_tables.users, user_id)
    if u is None:
        return C.fail("That account no longer exists.")
    if u == me and not flag:
        return C.fail("You can't remove your own admin rights.")
    u["is_admin"] = bool(flag)
    return C.ok(user=_user(u))


@anvil.server.callable(require_user=True)
def set_enabled(user_id, flag):
    me = C.require_admin()
    u = C.row_by_id(app_tables.users, user_id)
    if u is None:
        return C.fail("That account no longer exists.")
    if u == me:
        return C.fail("You can't disable your own account.")
    u["enabled"] = bool(flag)
    return C.ok(user=_user(u))


@anvil.server.callable(require_user=True)
def demo_load():
    C.require_admin()
    DemoData.load()
    return C.ok(demo={"state": DemoData.state(), "counts": DemoData.counts()})


@anvil.server.callable(require_user=True)
def demo_remove():
    C.require_admin()
    DemoData.remove()
    return C.ok(demo={"state": DemoData.state(), "counts": DemoData.counts()})


@anvil.server.callable(require_user=True)
def admin_usage(days=14):
    """Reels exported per day, the popular looks, shapes and lengths (demo rows included, marked)."""
    C.require_admin()
    days = int(days) if isinstance(days, (int, float)) and not isinstance(days, bool) and 1 <= days <= 90 else 14
    today = C.now().date()
    per_day = {(today - dt.timedelta(days=i)).isoformat(): 0 for i in range(days)}
    looks, aspects, lengths, demo = {}, {}, [], 0
    for e in app_tables.exports.search():
        if e["is_demo"]:
            demo += 1
        d = e["created"].date().isoformat() if e["created"] else None
        if d in per_day:
            per_day[d] += 1
        looks[e["look"] or "custom"] = looks.get(e["look"] or "custom", 0) + 1
        aspects[e["aspect"] or "9:16"] = aspects.get(e["aspect"] or "9:16", 0) + 1
        if e["seconds"]:
            lengths.append(e["seconds"])
    clips = list(app_tables.clips.search())
    return {"per_day": [{"day": k, "n": per_day[k]} for k in sorted(per_day)],
            "looks": sorted(([k, v] for k, v in looks.items()), key=lambda x: -x[1])[:8],
            "aspects": sorted(([k, v] for k, v in aspects.items()), key=lambda x: -x[1]),
            "avg_seconds": round(sum(lengths) / len(lengths), 1) if lengths else 0,
            "total": sum(per_day.values()), "demo_exports": demo,
            "captioned": len([c for c in clips if (c["style"] or {}).get("captions")]), "clips": len(clips)}
