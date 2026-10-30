"""The shape of a clip's style (and of a brand kit / template), and the cleaning every save goes through.

A style is a flat dict the browser's render engine reads (web/pages/_c_engine.html). Only the keys in SPEC are
kept; numbers are clamped, colours must be #rrggbb, strings are capped. Keep SPEC in step with
RS.DEFAULT_STYLE in web/pages/_a_core.html.
"""
import re

from . import common as C

ASPECTS = ["9:16", "1:1", "4:5", "16:9"]
LAYOUTS = ["fill", "fit", "framed", "split"]
CAP_STYLES = ["pop", "karaoke", "boxed", "minimal", "neon", "comic"]
FONTS = ["Anton", "Bricolage Grotesque", "DM Sans", "Bangers", "Luckiest Guy", "Bungee", "Titan One", "Lilita One",
         "Permanent Marker", "Pacifico", "Rubik Mono One"]
CORNERS = ["tl", "tr", "bl", "br", "off"]
TRANS = ["none", "fade", "flash", "zoom", "whip", "glitch", "shake", "spin", "pixel"]

# Text and stickers placed on the reel (style["layers"]). Times are seconds of the finished reel.
LAYER_TYPES = ["text", "emoji", "badge", "shape"]
TEXT_STYLES = ["outline", "hollow", "double", "pop3d", "glow", "sticker", "marker", "plain"]
BADGE_SHAPES = ["burst", "pill", "bubble", "circle"]
SHAPES = ["arrow", "ring", "underline", "sparkles", "heart", "star"]
ANIMS = ["none", "pop", "fade", "slide", "drop", "spin", "type", "zoom"]
LOOPS = ["none", "wiggle", "float", "pulse", "shake", "spin"]
MAX_LAYERS = 24
LAYER_SPEC = {
    "x": ("num", 0, 1), "y": ("num", 0, 1), "size": ("num", 0.2, 5), "rot": ("num", -180, 180),
    "s": ("num", 0, 900), "e": ("num", 0, 900), "all": ("bool",),
    "anim": ("enum", ANIMS), "loop": ("enum", LOOPS), "font": ("enum", FONTS), "ts": ("enum", TEXT_STYLES),
    "fill": ("color",), "line": ("color",), "shape": ("enum", BADGE_SHAPES), "upper": ("bool",),
}

SPEC = {
    "look": ("str", 24), "aspect": ("enum", ASPECTS), "layout": ("enum", LAYOUTS),
    "zoom": ("num", 1, 3), "fx": ("num", 0, 1), "fy": ("num", 0, 1),
    "zoom2": ("num", 1, 3), "fx2": ("num", 0, 1), "fy2": ("num", 0, 1), "split": ("num", 0.3, 0.7),
    "bg": ("color",), "punch": ("bool",),
    "captions": ("bool",), "capStyle": ("enum", CAP_STYLES), "capFont": ("enum", FONTS), "capSize": ("num", 0.5, 2),
    "capPos": ("num", 0.1, 0.95), "capWords": ("int", 1, 6), "capUpper": ("bool",), "capEmoji": ("bool",),
    "hl": ("color",), "capColor": ("color",),
    "hook": ("str", 90), "hookSecs": ("num", 0, 10), "hookBg": ("color",), "part": ("str", 20),
    "handle": ("str", 40), "handlePos": ("enum", CORNERS), "progress": ("bool",), "progColor": ("color",),
    "cta": ("bool",), "ctaText": ("str", 60),
    "speed": ("num", 0.5, 2), "cutSilence": ("bool",), "silence": ("num", 0, 1), "fadeIn": ("bool",), "fadeOut": ("bool",),
    "vol": ("num", 0, 2), "musicName": ("str", 80), "musicVol": ("num", 0, 1), "duck": ("bool",),
    "quality": ("enum", ["720", "1080"]),
    "transIn": ("enum", TRANS), "transOut": ("enum", TRANS), "transCut": ("enum", TRANS), "transLen": ("num", 0.15, 1),
    "transScenes": ("bool",), "layers": ("layers",),
}
KIT_EXTRA = {"hashtags": ("str", 200)}
COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def clean(style, extra=None):
    """A safe copy of `style`: known keys only, right types, within bounds."""
    spec = dict(SPEC, **(extra or {}))
    out = {}
    if not isinstance(style, dict):
        return out
    for k, v in style.items():
        rule = spec.get(k)
        if rule is None or v is None:
            continue
        kind = rule[0]
        if kind == "bool":
            out[k] = bool(v)
        elif kind in ("num", "int"):
            if isinstance(v, bool) or not isinstance(v, (int, float)) or v != v:
                continue
            v = min(rule[2], max(rule[1], v))
            out[k] = int(round(v)) if kind == "int" else round(float(v), 4)
        elif kind == "enum":
            if str(v) in rule[1]:
                out[k] = str(v)
        elif kind == "color":
            if isinstance(v, str) and COLOR.match(v):
                out[k] = v.upper()
        elif kind == "str":
            out[k] = C.text(v, rule[1])
        elif kind == "layers":
            out[k] = clean_layers(v)
    return out


def clean_layers(layers):
    """Text and stickers on the reel: a list of small dicts (see LAYER_SPEC). Bad ones are dropped."""
    out = []
    if not isinstance(layers, list):
        return out
    for L in layers[:MAX_LAYERS]:
        if not isinstance(L, dict) or L.get("t") not in LAYER_TYPES:
            continue
        t = L["t"]
        v = C.text(L.get("v"), 120, multiline=(t == "text"))
        if t == "shape" and v not in SHAPES:
            continue
        if not v:
            continue
        lay = clean({k: L[k] for k in L if k in LAYER_SPEC}, LAYER_SPEC)
        lay = {k: lay[k] for k in lay if k in LAYER_SPEC}
        lay.update(id=C.text(L.get("id"), 16) or ("L%d" % len(out)), t=t, v=v)
        out.append(lay)
    return out


def clean_kit(kit):
    return clean(kit, KIT_EXTRA)


def clean_post(post):
    if not isinstance(post, dict):
        return {}
    return {"caption": C.text(post.get("caption"), 2200, multiline=True), "hashtags": C.text(post.get("hashtags"), 300)}


def clean_words(words, limit=20000):
    """A transcript: [[start, end, "word"], ...] sorted by start."""
    out = []
    if not isinstance(words, list):
        return out
    for w in words[:limit]:
        if not isinstance(w, (list, tuple)) or len(w) < 3:
            continue
        s, e, t = w[0], w[1], w[2]
        if isinstance(s, bool) or isinstance(e, bool) or not isinstance(s, (int, float)) or not isinstance(e, (int, float)):
            continue
        t = C.text(t, 40)
        if not t or s < 0 or e < s or s > 86400:
            continue
        out.append([round(float(s), 3), round(float(e), 3), t])
    out.sort(key=lambda w: w[0])
    return out


def clean_transcript(tr):
    if tr is None:
        return None
    if not isinstance(tr, dict):
        return None
    return {"source": C.text(tr.get("source"), 20) or "manual", "lang": C.text(tr.get("lang"), 12),
            "words": clean_words(tr.get("words"))}
