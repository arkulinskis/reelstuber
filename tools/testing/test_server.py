"""Server tests against the strict mock of Anvil (tools/testing/mock).

    python tools/testing/test_server.py          -> prints ALL OK, or the first failure

call(name, ...) runs a server function the way the browser does: by name, with require_user enforced,
and the reply must be JSON (a datetime or a row in a reply fails here, like it would break the page).
Add tests for every new server function: the happy path, bad input, and someone who isn't allowed.
"""
import datetime as dt
import importlib
import json
import os
import pathlib
import shutil
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
_tmp = pathlib.Path(tempfile.mkdtemp())
shutil.copytree(PROJECT / "server_code", _tmp / "app")
(_tmp / "app" / "__init__.py").write_text("")
os.environ["ANVIL_APP_YAML"] = str(PROJECT / "anvil.yaml")  # the mock's tables follow the app's own schema
sys.path[:0] = [str(HERE / "mock"), str(_tmp)]
import anvil.server  # noqa: E402
import anvil.users  # noqa: E402
from anvil.tables import app_tables as T  # noqa: E402

M = {p.stem: importlib.import_module("app." + p.stem) for p in sorted((PROJECT / "server_code").glob("*.py"))}
now = dt.datetime.now(dt.timezone.utc)


def call(name, *args):
    r = anvil.server.call(name, *args)
    json.dumps(r)  # strict: must be JSON-able
    return r


def as_user(row):
    anvil.users.CURRENT[0] = row
    anvil.server.session.use(row.get_id() if row is not None else None)


def denied(name, *args):
    try:
        call(name, *args)
    except anvil.server.PermissionDenied:
        return True
    return False


def ok(r, msg=""):
    assert isinstance(r, dict) and r.get("ok"), (msg, r)
    return r


def bad(r, msg=""):
    assert isinstance(r, dict) and r.get("ok") is False and r.get("error"), (msg, r)
    return r


def person(email, name=None, **kw):
    return T.users.add_row(email=email, enabled=True, signed_up=now, display_name=name, **kw)


# ---------------------------------------------------------------------------------- accounts
admin = person("arkulinskis@gmail.com", "The Admin")
ana = person("ana@example.com", "Ana")
bob = person("bob@example.com")

as_user(None)
assert call("get_me") is None
assert denied("update_profile", "X")
as_user(admin)
assert call("get_me")["is_admin"] is True, "ADMIN_EMAILS become admins on first sign-in"
as_user(ana)
me = call("get_me")
assert me["name"] == "Ana" and me["is_admin"] is False
assert ana["last_seen"] is not None
as_user(bob)
assert call("get_me")["name"] == "Bob", "a name comes from the email when none is set"
bad(call("update_profile", " x "))
assert ok(call("update_profile", "  Bob   Stone "))["me"]["name"] == "Bob Stone"

# ---------------------------------------------------------------------------------- feedback
as_user(None)
bad(call("submit_feedback", "bug", "hi"))
ok(call("submit_feedback", "bug", "The button is broken", "guest@example.com", {"page": "#home", "evil": "x" * 9999}))
fb = T.feedback.search()[0]
assert fb["name"] == "Guest" and fb["email"] == "guest@example.com" and "evil" not in fb["context"] and fb["status"] == "new"
for i in range(4):
    ok(call("submit_feedback", "idea", "Idea number %d" % i))
bad(call("submit_feedback", "idea", "One too many this hour"), "rate limit")
as_user(ana)
ok(call("submit_feedback", "nonsense-kind", "Signed-in feedback"))
assert T.feedback.get(message="Signed-in feedback")["kind"] == "other"
assert denied("list_feedback")
as_user(admin)
lst = call("list_feedback")
assert lst["counts"]["new"] == 6 and len(lst["items"]) == 6
fid = lst["items"][0]["id"]
ok(call("set_feedback_status", fid, "done", "Fixed it"))
assert call("list_feedback", "done")["items"][0]["note"] == "Fixed it"
bad(call("set_feedback_status", fid, "weird"))
bad(call("set_feedback_status", "nope", "done"))
ok(call("delete_feedback", fid))
assert len(call("list_feedback")["items"]) == 5

# ---------------------------------------------------------------------------------- admin
as_user(ana)
for fn, args in [("admin_overview", ()), ("list_users", ()), ("set_admin", (bob.get_id(), True)), ("demo_load", ()), ("demo_remove", ())]:
    assert denied(fn, *args), fn
as_user(admin)
ov = call("admin_overview")
assert ov["users"] == 3 and ov["admins"] == 1 and ov["feedback_new"] == 5
assert len(call("list_users")["users"]) == 3 and len(call("list_users", "bob")["users"]) == 1
ok(call("set_admin", bob.get_id(), True))
assert bob["is_admin"] is True
bad(call("set_admin", admin.get_id(), False), "can't remove your own admin")
ok(call("set_enabled", bob.get_id(), False))
assert bob["enabled"] is False
bad(call("set_enabled", admin.get_id(), False))
ok(call("set_enabled", bob.get_id(), True))
ok(call("set_admin", bob.get_id(), False))
assert bob["is_admin"] is False

# ---------------------------------------------------------------------------------- demo data
as_user(None)
assert denied("studio_home")
tl = call("templates_list")
assert M["DemoData"].state() == "loaded" and len(tl["templates"]) == len(M["DemoData"].DEMO_TEMPLATES), "demo loads on first visit"
assert tl["templates"][0]["featured"], "featured templates come first"
assert all(not t["can_delete"] for t in tl["templates"])

# ---------------------------------------------------------------------------------- projects
META = {"title": "My long video", "file_name": "vlog.mp4", "file_size": 123456789, "duration": 600.5, "width": 1920, "height": 1080,
        "thumb": "data:image/jpeg;base64,AAAA"}
assert denied("project_create", META)
as_user(ana)
home = call("studio_home")
assert home["projects"] == [] and home["stats"]["exports"] == 0 and len(home["badges"]) == 8 and not any(b["got"] for b in home["badges"])
bad(call("project_create", {"title": "x", "duration": 0}), "no duration")
bad(call("project_create", "nonsense"))
pr = ok(call("project_create", META, {"source": "srt", "words": [[1, 1.5, "hello"], [0.2, 0.6, "first"], ["bad"], [5, 4, "backwards"]]}))["project"]
assert pr["title"] == "My long video" and pr["duration"] == 600.5 and pr["clips"] == []
assert [w[2] for w in pr["transcript"]["words"]] == ["first", "hello"], "transcript is cleaned and sorted"
pid = pr["id"]
evil = ok(call("project_create", dict(META, thumb="javascript:alert(1)", title="")))["project"]
assert evil["thumb"] == "" and evil["title"] == "vlog.mp4", "bad thumbs dropped, title falls back to the file name"
ok(call("project_update", pid, {"title": "Renamed", "settings": {"length": "30", "vibe": "hype", "junk": "x"}}))
bad(call("project_update", pid, {"title": "   "}))
assert call("project_get", pid)["project"]["title"] == "Renamed"
assert call("project_get", pid)["project"]["settings"] == {"length": "30", "vibe": "hype"}
as_user(bob)
bad(call("project_get", pid), "someone else's project is invisible")
bad(call("project_update", pid, {"title": "Mine now"}))
bad(call("clips_add", pid, [{"start": 1, "end": 20}]))
assert call("studio_home")["projects"] == []

# ---------------------------------------------------------------------------------- clips
as_user(ana)
bad(call("clips_add", pid, []))
bad(call("clips_add", pid, [{"start": 10, "end": 10.5}]), "too short")
bad(call("clips_add", pid, [{"start": 10}]), "needs an end")
r = ok(call("clips_add", pid, [
    {"title": "Hype bit", "start": 30, "end": 60, "score": 92, "label": "Hype spike", "source": "auto",
     "style": {"layout": "split", "zoom": 9, "capStyle": "pop", "hl": "#c6f432", "evil": "<script>", "hook": "x" * 500}},
    {"title": "Story", "start": 100, "end": 145, "score": 75, "source": "auto"},
    {"start": 590, "end": 9999, "source": "weird"}]))
assert len(r["clips"]) == 3 and len(r["added"]) == 3
c1 = r["clips"][0]
assert c1["style"]["zoom"] == 3 and c1["style"]["hl"] == "#C6F432" and "evil" not in c1["style"] and len(c1["style"]["hook"]) == 90
assert r["clips"][2]["end"] == 600.5 and r["clips"][2]["source"] == "manual" and r["clips"][2]["title"] == "Clip 3"
ok(call("clip_save", c1["id"], {"title": "Hype!", "status": "ready", "post": {"caption": "Look at this", "hashtags": "#fun"}}))
bad(call("clip_save", c1["id"], {"status": "published"}))
bad(call("clip_save", c1["id"], {"start": 50, "end": 49}))
saved = call("project_get", pid)["project"]["clips"][0]
assert saved["title"] == "Hype!" and saved["status"] == "ready" and saved["edited"] and saved["post"]["caption"] == "Look at this"
# text + stickers (style.layers) and transitions are cleaned
layers = [
    {"id": "t1", "t": "text", "v": "Wait for it\nno really", "x": 1.7, "y": 0.3, "size": 9, "rot": 400, "s": 1, "e": 4, "anim": "pop",
     "loop": "float", "font": "Luckiest Guy", "ts": "double", "fill": "#ffffff", "line": "#ff3d8b", "upper": True, "evil": 1},
    {"id": "e1", "t": "emoji", "v": "🔥", "x": 0.5, "y": 0.5, "anim": "explode", "font": "Comic Sans"},
    {"id": "s1", "t": "shape", "v": "pentagram"},              # unknown doodle: dropped
    {"id": "b1", "t": "badge", "v": "", "shape": "burst"},     # empty: dropped
    {"id": "x1", "t": "video", "v": "nope"},                   # unknown type: dropped
    "junk",
] + [{"id": "m%d" % i, "t": "emoji", "v": "✨"} for i in range(40)]
ok(call("clip_save", c1["id"], {"style": {"layers": layers, "transIn": "glitch", "transCut": "warp", "transLen": 7, "transScenes": 1}}))
sty = call("project_get", pid)["project"]["clips"][0]["style"]
L = sty["layers"]
assert len(L) <= 24 and L[0]["t"] == "text" and L[0]["x"] == 1 and L[0]["size"] == 5 and L[0]["rot"] == 180 and "evil" not in L[0], L[0]
assert L[0]["v"] == "Wait for it\nno really" and L[0]["fill"] == "#FFFFFF" and L[0]["font"] == "Luckiest Guy" and L[0]["upper"] is True
assert L[1] == {"id": "e1", "t": "emoji", "v": "🔥", "x": 0.5, "y": 0.5}, L[1]
assert not any(x["id"] in ("s1", "b1", "x1") for x in L)
assert sty["transIn"] == "glitch" and "transCut" not in sty and sty["transLen"] == 1 and sty["transScenes"] is True
# cards, word pins, text behind the person, colour grades, the corner card and the 3x3 wall are cleaned too
cards = [
    {"id": "c1", "t": "card", "v": "yt-dlp/yt-dlp", "card": "repo", "sub": "A downloader " * 20, "icon": "📦", "fill": "#2f81f7",
     "at": 12.5, "word": "yt-dlp", "behind": 1},
    {"id": "c2", "t": "card", "v": "FFmpeg", "card": "hologram", "at": -4},     # unknown card kind: dropped; a time below 0 clamps to 0
    {"id": "c3", "t": "card", "v": "   "},                                       # empty: dropped
    {"id": "t2", "t": "text", "v": "CLAUDE", "ts": "magazine", "font": "Playfair Display", "sub": "No. 01", "behind": True},
]
ok(call("clip_save", c1["id"], {"style": {"layers": cards, "capStyle": "clean", "grade": "moody", "gradeAmt": 3, "gradeWipe": 1,
                                          "layout": "pip", "pipPos": "tl", "pipSize": 0.9, "pipName": "x" * 200, "wall": True}}))
sty = call("project_get", pid)["project"]["clips"][0]["style"]
L = {x["id"]: x for x in sty["layers"]}
assert set(L) == {"c1", "c2", "t2"}, L
assert L["c1"]["card"] == "repo" and len(L["c1"]["sub"]) == 120 and L["c1"]["at"] == 12.5 and L["c1"]["word"] == "yt-dlp" and L["c1"]["behind"] is True and L["c1"]["fill"] == "#2F81F7"
assert "card" not in L["c2"] and L["c2"]["at"] == 0
assert L["t2"]["ts"] == "magazine" and L["t2"]["font"] == "Playfair Display" and L["t2"]["sub"] == "No. 01"
assert sty["capStyle"] == "clean" and sty["grade"] == "moody" and sty["gradeAmt"] == 1 and sty["gradeWipe"] is True
assert sty["layout"] == "pip" and sty["pipPos"] == "tl" and sty["pipSize"] == 0.6 and len(sty["pipName"]) == 80 and sty["wall"] is True
ok(call("clip_save", c1["id"], {"style": {"grade": "sepia-ish", "pipPos": "middle"}}))
sty = call("project_get", pid)["project"]["clips"][0]["style"]
assert "grade" not in sty and "pipPos" not in sty
# Find reels again: untouched auto drafts are replaced, edited ones stay
r2 = ok(call("clips_add", pid, [{"title": "New find", "start": 200, "end": 230, "source": "auto"}], True))
titles = [c["title"] for c in r2["clips"]]
assert "Hype!" in titles and "Story" not in titles and "New find" in titles and "Clip 3" in titles, titles
dup = ok(call("clip_duplicate", c1["id"]))
assert dup["clip"]["title"] == "Hype! (copy)" and dup["clip"]["source"] == "copy"
order = [c["title"] for c in dup["clips"]]
assert order.index("Hype! (copy)") == order.index("Hype!") + 1, order
as_user(bob)
bad(call("clip_save", c1["id"], {"title": "hijack"}))
bad(call("clip_duplicate", c1["id"]))
bad(call("export_logged", c1["id"], {"seconds": 30}))
ok(call("clip_delete", c1["id"]))  # not his: quietly nothing
as_user(ana)
assert any(c["id"] == c1["id"] for c in call("project_get", pid)["project"]["clips"]), "bob couldn't delete Ana's clip"

# ---------------------------------------------------------------------------------- exports, stats, badges
ex = ok(call("export_logged", c1["id"], {"seconds": 30.2, "format": "mp4"}))
assert ex["clip"]["status"] == "exported" and ex["clip"]["export_count"] == 1
assert [b["key"] for b in ex["new_badges"]] == ["first_cut"]
for c in call("project_get", pid)["project"]["clips"][:3]:
    ok(call("export_logged", c["id"], {"seconds": 20}))
st = call("studio_home")["stats"]
assert st["exports"] == 4 and st["minutes_saved"] == 48 and st["streak"] == 1 and st["captions"] == 0
got = {b["key"] for b in call("studio_home")["badges"] if b["got"]}
assert got == {"first_cut", "hat_trick"}, got
ok(call("clip_delete", c1["id"]))
assert call("studio_home")["stats"]["exports"] == 4, "deleting a clip keeps its exports in the stats"

# ---------------------------------------------------------------------------------- brand kit + templates
as_user(None)
assert denied("brand_save", {})
as_user(ana)
assert call("brand_get")["kit"] == {}
kit = ok(call("brand_save", {"handle": "@ana", "hl": "#FF3D8B", "capWords": 99, "hashtags": "#ana #reels", "nope": 1}))["kit"]
assert kit == {"handle": "@ana", "hl": "#FF3D8B", "capWords": 6, "hashtags": "#ana #reels"}, kit
assert call("studio_home")["brand"]["handle"] == "@ana"
bad(call("template_publish", "x", "🔥", {"capStyle": "pop"}))
bad(call("template_publish", "Empty", "🔥", {"junk": 1}))
tp = ok(call("template_publish", "Ana Pop", "🔥", {"capStyle": "pop", "hook": "my secret hook", "hl": "#FF3D8B", "transCut": "zoom", "layers": [{"t": "text", "v": "my name"}],
                                                   "grade": "warm", "pipName": "my-other-video.mp4"}))["template"]
assert "hook" not in tp["style"] and "layers" not in tp["style"] and tp["style"]["transCut"] == "zoom" and tp["mine"] and tp["by"] == "Ana"
assert tp["style"]["grade"] == "warm" and "pipName" not in tp["style"]
assert {b["key"] for b in call("studio_home")["badges"] if b["got"]} >= {"tastemaker"}
as_user(None)
assert any(t["id"] == tp["id"] for t in call("templates_list")["templates"])
ok(call("template_use", tp["id"]))
ok(call("template_use", tp["id"]))
assert T.templates.get_by_id(tp["id"])["uses"] == 1, "one use per session"
bad(call("template_use", "nope"))
assert denied("template_delete", tp["id"])
as_user(bob)
bad(call("template_delete", tp["id"]))
assert denied("admin_templates") and denied("admin_template_set", tp["id"], True, None) and denied("admin_usage")
as_user(admin)
assert len(call("admin_templates")["templates"]) == len(M["DemoData"].DEMO_TEMPLATES) + 1
ok(call("admin_template_set", tp["id"], True, True))
as_user(None)
assert not any(t["id"] == tp["id"] for t in call("templates_list")["templates"]), "hidden templates leave the gallery"
bad(call("template_use", tp["id"]))
as_user(admin)
bad(call("admin_template_set", "nope", True))
us = call("admin_usage")
assert len(us["per_day"]) == 14 and us["total"] >= 4 and us["demo_exports"] >= 1, us
ov = call("admin_overview")
assert ov["projects"] == 2 and ov["exports"] == 4 and ov["templates"] == 1, ov
ok(call("template_delete", tp["id"]), "admins can delete any template")

# ---------------------------------------------------------------------------------- guest import + delete
as_user(bob)
imp = ok(call("projects_import", [{"id": "local-1", "title": "Guest work", "duration": 61, "file_name": "a.mov",
                                   "clips": [{"title": "One", "start": 1, "end": 20, "status": "ready"}, {"start": 5, "end": 5.2}]},
                                  {"id": "local-2", "duration": 0}, "junk"]))
assert len(imp["imported"]) == 1 and imp["imported"][0]["local_id"] == "local-1"
bp = call("project_get", imp["imported"][0]["id"])["project"]
assert bp["title"] == "Guest work" and len(bp["clips"]) == 1 and bp["clips"][0]["status"] == "ready", "bad clips are skipped"
as_user(ana)
ok(call("project_delete", bp["id"]))  # not hers: nothing happens
as_user(bob)
assert call("project_get", bp["id"])["ok"]
ok(call("project_delete", bp["id"]))
bad(call("project_get", bp["id"]))
assert not T.clips.search(owner=bob)

# ---------------------------------------------------------------------------------- demo remove / reload
as_user(admin)
ok(call("demo_remove"))
assert M["DemoData"].state() == "removed" and not T.users.search(is_demo=True) and not T.templates.search(is_demo=True)
as_user(None)
call("templates_list")
assert M["DemoData"].state() == "removed", "removed demo data doesn't come back by itself"
as_user(admin)
ok(call("demo_load"))
ok(call("demo_load"))
assert len(T.templates.search(is_demo=True)) == len(M["DemoData"].DEMO_TEMPLATES), "reloading replaces the demo instead of doubling it"
as_user(ana)
assert len(call("studio_home")["projects"]) == 2, "real projects survive demo reloads"

# ---------------------------------------------------------------------------------- Privacy & Terms
if "legal_server" in M:
    as_user(ana)
    st = call("legal_state")
    assert st["signedIn"] and st["accepted_version"] is None
    ok(call("legal_accept", st["version"], "signup"))
    assert ana["legal_source"] == "signup" and call("legal_state")["accepted_version"] == st["version"]

# ---------------------------------------------------------------------------------- every callable is covered by a permission check
# A callable that changes data without require_user / a C.require_* check is a security hole. List the public ones here.
PUBLIC = {"get_me", "submit_feedback", "templates_list", "template_use", "legal_state", "legal_accept"}
for name, (f, need) in sorted(anvil.server.CALLABLES.items()):
    if name in PUBLIC:
        continue
    assert need, "%s is callable by anyone: add require_user=True (or list it in PUBLIC in test_server.py)" % name

print("ALL OK (%d server functions)" % len(anvil.server.CALLABLES))
