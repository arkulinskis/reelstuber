"""The studio: projects (one per source video), their clips (the reels), exports, stats and badges.

The video itself never reaches the server: the browser cuts and renders it. A project only keeps what's
needed to come back to the work: the file's name/size/length, a small preview frame, the transcript (if the
person made one), and every clip's times, style and post text. Everything here is private to its owner.
Guests use the same shapes from the browser's own storage (RS.db in web/pages/_a_core.html).
"""
import datetime as dt

import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from . import DemoData, Styles

MAX_PROJECTS = 200
MAX_CLIPS = 60
STATUSES = ["draft", "ready", "exported"]
SOURCES = ["auto", "manual", "chapter", "copy"]
MINUTES_SAVED_PER_REEL = 12

BADGES = [
    ("first_cut", "✂️", "First cut", "Export your first reel"),
    ("hat_trick", "🎩", "Hat trick", "Export 3 reels"),
    ("ten_club", "🔟", "Ten-reel club", "Export 10 reels"),
    ("caption_crew", "💬", "Caption crew", "Export 5 reels with captions"),
    ("on_fire", "🔥", "On fire", "Export on 3 days in a row"),
    ("binge", "🍿", "Binge cutter", "Export 5 reels from one video"),
    ("shape_shifter", "📐", "Shape shifter", "Export in 3 different shapes"),
    ("tastemaker", "🎨", "Tastemaker", "Share a template with everyone"),
]


# ------------------------------------------------------------------------------------------- shapes
def _num(v, lo=0.0, hi=86400.0):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or v != v:
        return None
    return round(min(hi, max(lo, float(v))), 3)


def _thumb(v):
    v = v if isinstance(v, str) else ""
    return v if v.startswith("data:image/") and len(v) <= 60000 else ""


def clip_dict(r):
    return {"id": r.get_id(), "project_id": r["project"].get_id() if r["project"] else None, "idx": r["idx"] or 0,
            "title": r["title"] or "", "start": r["start"] or 0, "end": r["end"] or 0, "score": r["score"],
            "label": r["label"] or "", "source": r["source"] or "manual", "edited": bool(r["edited"]),
            "status": r["status"] or "draft", "style": r["style"] or {}, "post": r["post"] or {},
            "export_count": r["export_count"] or 0, "exported_at": C.iso(r["exported_at"]),
            "created": C.iso(r["created"]), "updated": C.iso(r["updated"])}


def _clips_of(p):
    return sorted(app_tables.clips.search(project=p), key=lambda r: (r["idx"] or 0, r["start"] or 0))


def project_summary(p, clips=None):
    clips = _clips_of(p) if clips is None else clips
    return {"id": p.get_id(), "title": p["title"] or "Untitled", "file_name": p["file_name"] or "", "file_size": p["file_size"] or 0,
            "duration": p["duration"] or 0, "width": p["width"] or 0, "height": p["height"] or 0, "thumb": p["thumb"] or "",
            "sample": bool(p["sample"]), "created": C.iso(p["created"]), "updated": C.iso(p["updated"]),
            "clip_count": len(clips), "ready_count": len([c for c in clips if c["status"] == "ready"]),
            "exported_count": len([c for c in clips if c["status"] == "exported"]),
            "has_transcript": bool(p["transcript"] and p["transcript"].get("words"))}


def project_full(p):
    clips = _clips_of(p)
    out = project_summary(p, clips)
    out.update(transcript=p["transcript"], settings=p["settings"] or {}, clips=[clip_dict(c) for c in clips])
    return out


def _own_project(project_id):
    me = C.require_user()
    p = C.row_by_id(app_tables.projects, project_id)
    if p is None or p["owner"] != me:
        return me, None
    return me, p


def _own_clip(clip_id):
    me = C.require_user()
    c = C.row_by_id(app_tables.clips, clip_id)
    if c is None or c["owner"] != me:
        return me, None
    return me, c


def _touch(p):
    p["updated"] = C.now()


# ------------------------------------------------------------------------------------------- stats + badges
def stats_for(user):
    ex = list(app_tables.exports.search(owner=user)) if user else []
    days = sorted({e["created"].date() for e in ex if e["created"]}, reverse=True)
    streak, today = 0, C.now().date()
    if days and (today - days[0]).days <= 1:
        streak, cur = 1, days[0]
        for d in days[1:]:
            if (cur - d).days == 1:
                streak, cur = streak + 1, d
            elif d != cur:
                break
    per_project = {}
    for e in ex:
        if e["project"] is not None:
            per_project[e["project"].get_id()] = per_project.get(e["project"].get_id(), set()) | {e["clip"].get_id() if e["clip"] else e.get_id()}
    templates = len(app_tables.templates.search(owner=user, hidden=False)) if user else 0
    s = {"exports": len(ex), "seconds": round(sum(e["seconds"] or 0 for e in ex)), "streak": streak,
         "minutes_saved": len(ex) * MINUTES_SAVED_PER_REEL, "captions": len([e for e in ex if e["captions"]]),
         "aspects": len({e["aspect"] for e in ex if e["aspect"]}), "best_project": max([len(v) for v in per_project.values()] or [0]),
         "templates": templates}
    if user:
        s["projects"] = len(app_tables.projects.search(owner=user))
        s["clips"] = len(app_tables.clips.search(owner=user))
    return s


def badges_for(s):
    got = {"first_cut": s["exports"] >= 1, "hat_trick": s["exports"] >= 3, "ten_club": s["exports"] >= 10,
           "caption_crew": s["captions"] >= 5, "on_fire": s["streak"] >= 3, "binge": s["best_project"] >= 5,
           "shape_shifter": s["aspects"] >= 3, "tastemaker": s["templates"] >= 1}
    return [{"key": k, "emoji": e, "name": n, "desc": d, "got": bool(got.get(k))} for k, e, n, d in BADGES]


# ------------------------------------------------------------------------------------------- home
@anvil.server.callable(require_user=True)
def studio_home():
    """The studio page in one call: projects, stats, badges, brand kit."""
    DemoData.ensure_loaded()
    me = C.require_user()
    rows = list(app_tables.projects.search(tables.order_by("updated", ascending=False), owner=me))
    s = stats_for(me)
    from . import Brand
    return {"projects": [project_summary(p) for p in rows], "stats": s, "badges": badges_for(s), "brand": Brand.kit_of(me)}


# ------------------------------------------------------------------------------------------- projects
def _create(me, meta, transcript=None):
    meta = meta if isinstance(meta, dict) else {}
    title = C.text(meta.get("title"), 120) or C.text(meta.get("file_name"), 120) or "Untitled video"
    now = C.now()
    return app_tables.projects.add_row(
        owner=me, title=title, file_name=C.text(meta.get("file_name"), 200), file_size=_num(meta.get("file_size"), 0, 1e13) or 0,
        duration=_num(meta.get("duration"), 0, 86400) or 0, width=_num(meta.get("width"), 0, 10000) or 0,
        height=_num(meta.get("height"), 0, 10000) or 0, thumb=_thumb(meta.get("thumb")), sample=bool(meta.get("sample")),
        transcript=Styles.clean_transcript(transcript), settings={}, created=now, updated=now, is_demo=False)


@anvil.server.callable(require_user=True)
def project_create(meta, transcript=None):
    me = C.require_user()
    if len(app_tables.projects.search(owner=me)) >= MAX_PROJECTS:
        return C.fail("You have %d projects. Delete a few old ones to start a new one." % MAX_PROJECTS)
    if C.rate_limited("project_create", 60, 3600):
        return C.fail("That's a lot of new projects in one hour. Please try again a bit later.")
    if not isinstance(meta, dict) or not (_num(meta.get("duration")) or 0) > 0:
        return C.fail("That video has no length we can read. Try another file.")
    return C.ok(project=project_full(_create(me, meta, transcript)))


@anvil.server.callable(require_user=True)
def project_get(project_id):
    me, p = _own_project(project_id)
    if p is None:
        return C.fail("That project isn't here any more.")
    return C.ok(project=project_full(p))


@anvil.server.callable(require_user=True)
def project_update(project_id, fields):
    me, p = _own_project(project_id)
    if p is None:
        return C.fail("That project isn't here any more.")
    if not isinstance(fields, dict):
        return C.fail("Nothing to save.")
    ch = {}
    if "title" in fields:
        t = C.text(fields["title"], 120)
        if len(t) < 1:
            return C.fail("Give the project a name.")
        ch["title"] = t
    if "thumb" in fields:
        ch["thumb"] = _thumb(fields["thumb"])
    if "transcript" in fields:
        ch["transcript"] = Styles.clean_transcript(fields["transcript"])
    if "settings" in fields and isinstance(fields["settings"], dict):
        st = {}
        for k in ("length", "count", "vibe"):
            if k in fields["settings"]:
                st[k] = C.text(fields["settings"][k], 20)
        ch["settings"] = st
    for k, hi in (("duration", 86400), ("width", 10000), ("height", 10000), ("file_size", 1e13)):
        if k in fields and _num(fields[k], 0, hi) is not None:
            ch[k] = _num(fields[k], 0, hi)
    if "file_name" in fields:
        ch["file_name"] = C.text(fields["file_name"], 200)
    ch["updated"] = C.now()
    p.update(**ch)
    return C.ok(project=project_summary(p))


@anvil.server.callable(require_user=True)
def project_delete(project_id):
    me, p = _own_project(project_id)
    if p is None:
        return C.ok()
    for e in app_tables.exports.search(project=p):
        e.update(project=None, clip=None)
    for c in app_tables.clips.search(project=p):
        c.delete()
    p.delete()
    return C.ok()


# ------------------------------------------------------------------------------------------- clips
def _clip_fields(raw, duration):
    """Clean the editable fields of a clip. Returns (fields, error)."""
    out = {}
    if "title" in raw:
        out["title"] = C.text(raw["title"], 100)
    if "start" in raw or "end" in raw:
        s, e = _num(raw.get("start")), _num(raw.get("end"))
        if s is None or e is None:
            return None, "A clip needs a start and an end."
        if duration:
            s, e = min(s, duration), min(e, duration)
        if e - s < 1:
            return None, "A clip must be at least 1 second long."
        if e - s > 600:
            return None, "A reel can be 10 minutes at most."
        out["start"], out["end"] = s, e
    if "score" in raw:
        out["score"] = _num(raw["score"], 0, 100)
    if "label" in raw:
        out["label"] = C.text(raw["label"], 40)
    if "style" in raw:
        out["style"] = Styles.clean(raw["style"])
    if "post" in raw:
        out["post"] = Styles.clean_post(raw["post"])
    if "status" in raw:
        if raw["status"] not in STATUSES:
            return None, "Unknown status."
        out["status"] = raw["status"]
    if "idx" in raw:
        out["idx"] = int(_num(raw["idx"], 0, 999) or 0)
    return out, None


def _add_clip(me, p, raw, idx):
    f, err = _clip_fields(raw, p["duration"])
    if err:
        return None, err
    if "start" not in f:
        return None, "A clip needs a start and an end."
    now = C.now()
    src = raw.get("source") if raw.get("source") in SOURCES else "manual"
    row = app_tables.clips.add_row(
        project=p, owner=me, idx=f.get("idx", idx), title=f.get("title") or "Clip %d" % (idx + 1), start=f["start"], end=f["end"],
        score=f.get("score"), label=f.get("label", ""), source=src, edited=False, status=f.get("status", "draft"),
        style=f.get("style", {}), post=f.get("post", {}), export_count=0, exported_at=None, created=now, updated=now, is_demo=False)
    return row, None


@anvil.server.callable(require_user=True)
def clips_add(project_id, clips, replace_drafts=False):
    """Add clips (from Find reels, chapters or by hand). replace_drafts drops untouched auto drafts first."""
    me, p = _own_project(project_id)
    if p is None:
        return C.fail("That project isn't here any more.")
    if not isinstance(clips, list) or not clips:
        return C.fail("No clips to add.")
    if replace_drafts:
        for c in app_tables.clips.search(project=p, source="auto", edited=False, status="draft"):
            c.delete()
    have = _clips_of(p)
    if len(have) + len(clips) > MAX_CLIPS:
        return C.fail("A project can hold %d clips. Delete a few first." % MAX_CLIPS)
    start_idx = max([c["idx"] or 0 for c in have] or [-1]) + 1
    added = []
    for i, raw in enumerate(clips):
        if not isinstance(raw, dict):
            continue
        row, err = _add_clip(me, p, raw, start_idx + i)
        if err:
            return C.fail(err)
        added.append(row)
    _touch(p)
    return C.ok(clips=[clip_dict(c) for c in _clips_of(p)], added=[c.get_id() for c in added])


@anvil.server.callable(require_user=True)
def clip_save(clip_id, fields):
    me, c = _own_clip(clip_id)
    if c is None:
        return C.fail("That clip isn't here any more.")
    if not isinstance(fields, dict):
        return C.fail("Nothing to save.")
    f, err = _clip_fields(fields, c["project"]["duration"] if c["project"] else 0)
    if err:
        return C.fail(err)
    if any(k in f for k in ("start", "end", "style", "title")):
        f["edited"] = True
    f["updated"] = C.now()
    c.update(**f)
    if c["project"]:
        _touch(c["project"])
    return C.ok(clip=clip_dict(c))


@anvil.server.callable(require_user=True)
def clip_duplicate(clip_id):
    me, c = _own_clip(clip_id)
    if c is None:
        return C.fail("That clip isn't here any more.")
    p = c["project"]
    if len(_clips_of(p)) >= MAX_CLIPS:
        return C.fail("A project can hold %d clips. Delete a few first." % MAX_CLIPS)
    raw = {"title": (c["title"] or "Clip") + " (copy)", "start": c["start"], "end": c["end"], "score": c["score"], "label": c["label"],
           "style": dict(c["style"] or {}), "post": dict(c["post"] or {}), "source": "copy", "idx": (c["idx"] or 0)}
    row, err = _add_clip(me, p, raw, (c["idx"] or 0))
    if err:
        return C.fail(err)
    for other in _clips_of(p):  # put the copy right after the original
        if other != row and other != c and (other["idx"] or 0) >= (c["idx"] or 0):
            other["idx"] = (other["idx"] or 0) + 1
    row["idx"] = (c["idx"] or 0) + 1
    _touch(p)
    return C.ok(clip=clip_dict(row), clips=[clip_dict(x) for x in _clips_of(p)])


@anvil.server.callable(require_user=True)
def clip_delete(clip_id):
    me, c = _own_clip(clip_id)
    if c is None:
        return C.ok()
    for e in app_tables.exports.search(clip=c):
        e["clip"] = None
    if c["project"]:
        _touch(c["project"])
    c.delete()
    return C.ok()


@anvil.server.callable(require_user=True)
def export_logged(clip_id, info=None):
    """The browser finished rendering a reel: count it, mark the clip exported, and say which badges are new."""
    me, c = _own_clip(clip_id)
    if c is None:
        return C.fail("That clip isn't here any more.")
    if C.rate_limited("export", 120, 3600):
        return C.ok(clip=clip_dict(c), stats=stats_for(me), new_badges=[])
    info = info if isinstance(info, dict) else {}
    before = {b["key"] for b in badges_for(stats_for(me)) if b["got"]}
    style = c["style"] or {}
    app_tables.exports.add_row(owner=me, project=c["project"], clip=c, seconds=_num(info.get("seconds"), 0, 3600) or 0,
                               format=C.text(info.get("format"), 10), aspect=style.get("aspect") or "9:16",
                               look=C.text(style.get("look"), 24), captions=bool(style.get("captions")), created=C.now(), is_demo=False)
    c.update(status="exported", export_count=(c["export_count"] or 0) + 1, exported_at=C.now())
    s = stats_for(me)
    new = [b for b in badges_for(s) if b["got"] and b["key"] not in before]
    return C.ok(clip=clip_dict(c), stats=s, new_badges=new)


# ------------------------------------------------------------------------------------------- guest import
@anvil.server.callable(require_user=True)
def projects_import(projects):
    """Move projects a guest made in this browser into their new account."""
    me = C.require_user()
    if not isinstance(projects, list):
        return C.fail("Nothing to import.")
    if C.rate_limited("import", 5, 3600):
        return C.fail("Please wait a little before importing again.")
    done = []
    for raw in projects[:20]:
        if not isinstance(raw, dict) or not (_num(raw.get("duration")) or 0) > 0:
            continue
        p = _create(me, raw, raw.get("transcript"))
        for i, c in enumerate((raw.get("clips") or [])[:MAX_CLIPS]):
            if isinstance(c, dict):
                row, err = _add_clip(me, p, c, i)
                if row is not None and c.get("status") in STATUSES:
                    row["status"] = c["status"]
        done.append({"local_id": C.text(raw.get("id"), 60), "id": p.get_id()})
    return C.ok(imported=done)


def demo_project(owner, title, minutes_ago, clips, transcript=None):
    """Used by DemoData and the dev server: a sample-video project with clips."""
    p = app_tables.projects.add_row(owner=owner, title=title, file_name="sample.webm", file_size=2685648, duration=52.8,
                                    width=640, height=360, thumb="", sample=True, transcript=transcript, settings={},
                                    created=C.now() - dt.timedelta(minutes=minutes_ago + 30),
                                    updated=C.now() - dt.timedelta(minutes=minutes_ago), is_demo=bool(owner["is_demo"]))
    for i, c in enumerate(clips):
        app_tables.clips.add_row(project=p, owner=owner, idx=i, title=c["title"], start=c["start"], end=c["end"],
                                 score=c.get("score"), label=c.get("label", ""), source=c.get("source", "auto"), edited=False,
                                 status=c.get("status", "draft"), style=Styles.clean(c.get("style", {})), post={},
                                 export_count=1 if c.get("status") == "exported" else 0,
                                 exported_at=C.now() - dt.timedelta(minutes=minutes_ago) if c.get("status") == "exported" else None,
                                 created=p["created"], updated=p["updated"], is_demo=bool(owner["is_demo"]))
    return p
