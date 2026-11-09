"""Reelstuber's JavaScript engines (theme/assets/rs-*.js, window.RS) seen from Python.

The engines analyse and draw video (RS.analyze, RS.findClips, RS.render, RS.Player, RS.exportClip, RS.stylePreview),
keep guests' projects in this browser (RS.db: the server when signed in, localStorage for guests, same reply shapes)
and run the two editor screens (rs-screens.js: project, clip). Python reaches them only through this module:

    rs.setup()              once at start-up: the server bridge (UI.api in the engines) and RS.host (toasts, dialogs)
    rs.set_me(me)           tell the engines who is signed in (RS.db picks server or browser storage by it)
    rs.db(method, *args)    RS.db.<method>(...) as plain Python (dicts/lists), e.g. rs.db("home"), rs.db("brand")
    rs.looks() / lists()    the built-in looks, fonts, grades, transitions (from rs-core.js)
    rs.full_style(kit)      RS.fullStyle: a style with every default filled in
    rs.apply_look(st, look_style, key)
    rs.preview(canvas, style, opts)   draw a still of a reel in that style (RS.stylePreview)
    rs.set_kit(kit)         RS.kit, the brand kit new clips start from
    rs.start_sample() / rs.start_project(file)   open a video, make the project, go to it (busy dialog in the engine)
Engine replies come back as JSON text (RS.json in rs-kit.js), so Python always gets real dicts.
"""
import json

import anvil
import anvil.js
from anvil import confirm
import anvil.server
from anvil.js import window

from . import router, state

RS = window.RS
UI = window.UI
NULL = anvil.js.call(window.Function("return null"))  # "no JS object yet", typed for the validator


def js_value(x):
    """Python -> a real JS object (not a proxy of a Python dict)."""
    return window.JSON.parse(json.dumps(x))


def db(method, *args):
    """RS.db.<method>(*args) -> Python. Raises on a rejected promise (a full browser, a server {"ok": False})."""
    return json.loads(RS.json.db(method, json.dumps(list(args))))


def looks():
    return json.loads(RS.json.looks())


def lists():
    return json.loads(RS.json.lists())


def full_style(kit=None):
    return json.loads(RS.json.fullStyle(json.dumps(kit or {})))


def apply_look(st, look_style, key):
    return json.loads(RS.json.applyLook(json.dumps(st), json.dumps(look_style), key))


def preview(canvas, style, opts=None):
    """Draw a reel still into a <canvas> DOM node (waits for the caption fonts)."""
    RS.previewJson(canvas, json.dumps(style), json.dumps(opts or {}))


def set_kit(kit):
    RS.kit = js_value(kit or {})


def set_me(me):
    UI.me = js_value(me) if me else None


def start_sample():
    RS.startSample()


def start_project(file):
    RS.startProject(file)


def message(e):
    """The readable text of an engine/server error."""
    msg = str(getattr(e, "message", "") or e) or "That didn't work."
    return msg.replace("Error: ", "")


# ---------------------------------------------------------------- server calls for the engines (UI.api)
def _bridge(kind, payload_json):
    """Called from JS. Always returns a JSON string: {"result": ...} or {"error": ...}."""
    p = json.loads(payload_json) if payload_json else {}
    try:
        if kind == "call":
            call = anvil.server.call_s if p.get("quiet") else anvil.server.call
            return json.dumps({"result": call(p["fn"], *(p.get("args") or []))})
        return json.dumps({"error": "Unknown request: %s" % kind})
    except Exception as e:
        kind_of = type(e).__name__  # (some of Anvil's exception classes aren't in the validator's stubs)
        if kind_of == "SessionExpiredError":
            return json.dumps({"error": "Your session expired. Reload the page and sign in again.", "reload": True})
        if kind_of == "AppOfflineError":
            return json.dumps({"error": "You seem to be offline. Check your connection and try again."})
        if kind_of == "PermissionDenied":
            return json.dumps({"error": str(e) or "You don't have access to that.", "denied": True})
        print("bridge %s %s failed: %r" % (kind, p.get("fn", ""), e))
        return json.dumps({"error": "Something went wrong. Please try again.", "detail": repr(e)[:300]})


# ---------------------------------------------------------------- RS.host: what the engines ask Python to show
def _toast(message_text, kind=""):
    state.toast(message_text, kind or None)


def _confirm(options_json):
    o = json.loads(options_json or "{}")
    return bool(confirm(o.get("text") or "", title=o.get("title") or "Are you sure?",
                        buttons=[(o.get("cancel") or "Cancel", False), (o.get("ok") or "OK", True)], role="app-dialog"))


def _go(target_hash):
    router.show()


def setup():
    window.RS_BRIDGE = _bridge
    RS.host = js_value({})
    for name, fn in (("toast", _toast), ("confirm", _confirm), ("go", _go)):
        RS.host[name] = fn
