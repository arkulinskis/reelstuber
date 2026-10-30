"""Demo content, so the app never looks empty. Loaded automatically the first time anyone opens the app
(ensure_loaded), removed or reloaded from Admin -> Demo data. Removing it is remembered: it doesn't come back.

Demo people have is_demo=True and @example.com emails; they can't sign in (no password). Every demo row is
flagged is_demo=True, so remove() deletes exactly what load() added. What visitors see: the community
templates in the gallery. The demo projects and exports (made from the bundled sample video) fill the
admin's usage charts.
"""
import datetime as dt

from anvil.tables import app_tables

from . import common as C

DEMO_USERS = [
    ("Maya Chen", "maya.demo@example.com"),     # podcaster
    ("Theo Martin", "theo.demo@example.com"),   # gaming streamer
    ("Ines Ozola", "ines.demo@example.com"),    # home cook
]
DEMO_TEMPLATES = [
    (0, "Podcast Pop", "🎙️", True, 214, {"look": "podcast-pop", "layout": "fill", "captions": True, "capStyle": "pop", "capFont": "Anton",
                                        "capWords": 3, "capUpper": True, "hl": "#C6F432", "progress": True, "progColor": "#FF3D8B",
                                        "capPos": 0.7, "punch": True, "cta": True, "ctaText": "Full episode on my channel 🎧"}),
    (1, "Gamer Split", "🎮", True, 187, {"look": "gamer-split", "layout": "split", "split": 0.55, "fy2": 0.5, "captions": True,
                                       "capStyle": "comic", "capFont": "Bangers", "capWords": 2, "capUpper": True, "hl": "#FFE14D",
                                       "capPos": 0.55, "progress": True, "progColor": "#22E6D0", "punch": True}),
    (2, "Soft Kitchen", "🍋", False, 96, {"look": "soft-kitchen", "layout": "framed", "bg": "#FFE7C2", "captions": True,
                                        "capStyle": "minimal", "capFont": "DM Sans", "capWords": 5, "capUpper": False, "hl": "#FF8A3D",
                                        "capColor": "#1A1033", "capPos": 0.78, "hookBg": "#FF8A3D", "progress": False}),
    (1, "Midnight Neon", "🌙", False, 73, {"look": "midnight-neon", "layout": "fit", "captions": True, "capStyle": "neon",
                                         "capFont": "Bricolage Grotesque", "capWords": 3, "hl": "#22E6D0", "capPos": 0.74,
                                         "progColor": "#7C5CFF", "progress": True}),
    (0, "Karaoke Queen", "🎤", False, 58, {"look": "karaoke-queen", "layout": "fill", "captions": True, "capStyle": "karaoke",
                                         "capFont": "Anton", "capWords": 4, "capUpper": True, "hl": "#FF3D8B", "capPos": 0.68}),
    (2, "Boxed Facts", "📦", False, 41, {"look": "boxed-facts", "layout": "framed", "bg": "#1A1033", "captions": True,
                                       "capStyle": "boxed", "capFont": "DM Sans", "capWords": 4, "hl": "#FFD84D", "capPos": 0.8,
                                       "hookBg": "#FFD84D"}),
]
# (owner, title, minutes ago, [(title, start, end, score, label, status)])
DEMO_PROJECTS = [
    (0, "Snack Lab tryout (Maya)", 60 * 26, [("Pickle popcorn verdict", 26.9, 41.0, 97, "🔥 Hype spike", "exported"),
                                             ("The microwave story", 12.4, 26.4, 81, "💬 Story time", "exported"),
                                             ("Cold popcorn secret", 41.4, 51.0, 74, "🎯 Quotable", "ready")]),
    (1, "Snack Lab speedrun (Theo)", 60 * 50, [("Ten out of ten!", 30.0, 40.5, 95, "🔥 Hype spike", "exported"),
                                               ("Welcome to Snack Lab", 0.0, 11.0, 70, "⚡ Strong hook", "draft")]),
    (2, "Snack Lab, kitchen cut (Ines)", 60 * 6, [("Fridge trick", 41.4, 51.0, 88, "🎯 Quotable", "exported")]),
]
# Tables that hold demo rows (each has an is_demo column). Children before parents.
DEMO_TABLES = ["exports", "clips", "templates", "projects"]


def state():
    return C.get_setting("demo", "never")  # "never" | "loaded" | "removed"


def ensure_loaded():
    """Called from the main data callables: loads the demo once, unless an admin removed it."""
    if state() == "never":
        load()


def load():
    from . import Studio
    remove(remember=False)
    users = []
    for name, email in DEMO_USERS:
        u = app_tables.users.get(email=email) or app_tables.users.add_row(email=email, enabled=False)
        u.update(display_name=name, is_demo=True, signed_up=C.now() - dt.timedelta(days=30))
        users.append(u)
    for i, (who, name, emoji, featured, uses, style) in enumerate(DEMO_TEMPLATES):
        app_tables.templates.add_row(owner=users[who], name=name, emoji=emoji, style=style, uses=uses, featured=featured,
                                     hidden=False, created=C.now() - dt.timedelta(days=20 - i), is_demo=True)
    for who, title, ago, clips in DEMO_PROJECTS:
        p = Studio.demo_project(users[who], title, ago, [
            {"title": t, "start": s, "end": e, "score": sc, "label": lb, "status": st,
             "style": DEMO_TEMPLATES[who][5]} for t, s, e, sc, lb, st in clips])
        for c in app_tables.clips.search(project=p, status="exported"):
            app_tables.exports.add_row(owner=users[who], project=p, clip=c, seconds=round(c["end"] - c["start"], 1), format="mp4",
                                       aspect="9:16", look=(c["style"] or {}).get("look", ""), captions=True,
                                       created=c["exported_at"], is_demo=True)
    C.set_setting("demo", "loaded")
    return counts()


def remove(remember=True):
    for name in DEMO_TABLES:
        for r in getattr(app_tables, name).search(is_demo=True):
            r.delete()
    for u in app_tables.users.search(is_demo=True):
        for k in app_tables.brand_kits.search(owner=u):
            k.delete()
        u.delete()
    if remember:
        C.set_setting("demo", "removed")
    return counts()


def counts():
    out = {"users": len(app_tables.users.search(is_demo=True))}
    for name in DEMO_TABLES:
        out[name] = len(getattr(app_tables, name).search(is_demo=True))
    return out
