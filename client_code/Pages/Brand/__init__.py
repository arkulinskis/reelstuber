from anvil import *
import anvil.js
import anvil.server
from anvil.js import window

from ._anvil_designer import BrandTemplate
from ... import rs, state

CAP = [["clean", "🤍 Clean"], ["pop", "💥 Pop"], ["karaoke", "🎤 Karaoke"], ["boxed", "📦 Boxed"], ["minimal", "🫧 Minimal"],
       ["neon", "🌙 Neon"], ["comic", "🗯️ Comic"]]
CORNERS = [["tl", "↖ Top left"], ["tr", "↗ Top right"], ["bl", "↙ Bottom left"], ["br", "↘ Bottom right"], ["off", "Hide"]]
ASPECTS = [["9:16", "9:16 Reels"], ["4:5", "4:5 Feed"], ["1:1", "1:1"], ["16:9", "16:9"]]
QUALITY = [["1080", "Full HD"], ["720", "Faster 720p"]]
SWITCHES = ["captions", "capUpper", "capEmoji", "progress", "cta", "cutSilence", "punch"]
COLORS = ["hl", "capColor", "hookBg", "progColor"]


def loose(x):
    """dom_nodes with names built at run time (the validator only knows literal keys)."""
    return x


class Brand(BrandTemplate):
    """#brand, the brand kit (Operate): the default look every new clip starts with (handle, captions, colours, end
    card, transitions, shape ...), with a live preview drawn by the app's renderer. Guests keep it in this browser
    (RS.db). Members also see the templates they shared. Unsaved changes are saved when you leave the page."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.dirty = False
        self.kit: dict = {}
        self.mine: list = []
        L = rs.lists()
        self._lists = {"handlePos": CORNERS, "grade": L["grades"], "capStyle": CAP, "capWords": [[n, str(n)] for n in range(1, 6)],
                       "transIn": L["trans"], "transCut": L["trans"], "transOut": L["trans"], "aspect": ASPECTS,
                       "quality": QUALITY}
        self._looks = rs.looks()
        self._look_keys = L["lookKeys"]
        self.font_box.items = L["fonts"]
        state.set_control_attr(self.font_box, "aria-label", "Caption font")
        for key in self._lists:
            panel = getattr(self, "c_" + key)
            panel.add_event_handler("x-chip", self._chip)
        self.looks_panel.add_event_handler("x-look", self._look)
        self.mine_panel.add_event_handler("x-delete", self._delete_mine)
        for key in SWITCHES:
            loose(self.dom_nodes)["sw_" + key].addEventListener("change", self._switch)
        for key in COLORS:
            loose(self.dom_nodes)["col_" + key].addEventListener("input", self._color)
        self._before = anvil.js.report_exceptions(self._before_unload)
        self.lead.text = "Every new clip starts with these. You can still change anything per clip." + (
            "" if state.me() else " (Saved in this browser until you sign up.)")
        try:
            r = rs.db("brand")
        except Exception as e:
            state.toast(rs.message(e), "error")
            r = {"kit": {}, "templates": []}
        self.kit = dict(r.get("kit") or {})
        rs.set_kit(self.kit)
        self.mine = list(r.get("templates") or [])
        self.draw()

    # ---- drawing
    def st(self):
        return rs.full_style(self.kit)

    def draw(self):
        """Every control from the kit (after loading, a chip, a look or a reset)."""
        s = self.st()
        self.handle_box.text = self.kit.get("handle") or ""
        self.hashtags_box.text = self.kit.get("hashtags") or ""
        self.cta_box.text = s.get("ctaText") or ""
        self.font_box.selected_value = s.get("capFont") if s.get("capFont") in self.font_box.items else None
        for key in SWITCHES:
            loose(self.dom_nodes)["sw_" + key].checked = bool(s.get(key))
        for key in COLORS:
            loose(self.dom_nodes)["col_" + key].value = s.get(key) or "#000000"
        self.draw_chips(s)
        base = dict(s)
        base["aspect"] = "9:16"
        looks: list = [{"look": look, "on": s.get("look") == look["key"],
                                   "style": rs.apply_look(base, look["style"], look["key"])} for look in self._looks]
        self.looks_panel.items = looks
        me = state.me()
        self.mine_card.visible = bool(me)
        self.mine_panel.items = self.mine
        self.no_mine.visible = not self.mine
        self.preview_now()

    def draw_chips(self, s):
        for key, values in self._lists.items():
            getattr(self, "c_" + key).items = [{"key": key, "value": v[0], "label": v[1], "on": str(s.get(key)) == str(v[0])}
                                               for v in values]

    def preview_now(self):
        s = self.st()
        s["hook"] = "Your hook goes here 👀"
        self.preview.draw(s, {"width": 300, "t": 1.4})

    def set_k(self, key, value, redraw=False):
        self.kit[key] = value
        self.dirty = True
        if redraw:
            focus = state.focus_key()
            self.draw()
            panel = getattr(self, "c_" + key, None)
            if panel is not None:
                state.refocus(panel, focus)
        else:
            self.preview_now()

    # ---- inputs
    def _chip(self, key, value, **event_args):
        self.set_k(key, int(value) if key == "capWords" else value, True)

    def _look(self, look, **event_args):
        merged = rs.apply_look(self.st(), look["style"], look["key"])
        for k in self._look_keys + ["look"]:
            if k in merged:
                self.kit[k] = merged[k]
        self.dirty = True
        focus = state.focus_key()
        self.draw()
        state.refocus(self.looks_panel, focus)

    def _switch(self, event):
        self.set_k(self._dom_key(event.target, "sw_"), bool(event.target.checked))

    def _color(self, event):
        self.set_k(self._dom_key(event.target, "col_"), str(event.target.value).upper())

    def _dom_key(self, el, prefix):
        for key in (SWITCHES if prefix == "sw_" else COLORS):
            if loose(self.dom_nodes)[prefix + key] == el:
                return key
        return ""

    @handle("handle_box", "change")
    def handle_box_change(self, **event_args):
        self.set_k("handle", self.handle_box.text or "")

    @handle("hashtags_box", "change")
    def hashtags_box_change(self, **event_args):
        self.set_k("hashtags", self.hashtags_box.text or "")

    @handle("cta_box", "change")
    def cta_box_change(self, **event_args):
        self.set_k("ctaText", self.cta_box.text or "")

    @handle("font_box", "change")
    def font_box_change(self, **event_args):
        self.set_k("capFont", self.font_box.selected_value)

    # ---- save / reset / your templates
    def save(self, quiet=False):
        kit = rs.db("saveBrand", self.kit)
        self.kit = dict(kit or {})
        rs.set_kit(self.kit)
        self.dirty = False
        state.toast("Brand kit saved" if quiet else "Brand kit saved. New clips will use it.", "ok")

    @handle("save_button", "click")
    def save_button_click(self, **event_args):
        self.save_button.enabled = False
        try:
            self.save()
        except Exception as e:
            state.toast(rs.message(e), "error")
        self.save_button.enabled = True

    @handle("reset_button", "click")
    def reset_button_click(self, **event_args):
        if confirm("Back to Reelstuber's default look. Clips you already made keep theirs.", title="Reset your brand kit?",
                   buttons=[("Cancel", False), ("Reset", True)], role="app-dialog"):
            self.kit = {}
            try:
                rs.db("saveBrand", {})
                rs.set_kit({})
                self.dirty = False
                self.draw()
                state.toast("Reset", "ok")
            except Exception as e:
                state.toast(rs.message(e), "error")

    def _delete_mine(self, item, **event_args):
        if confirm("It leaves the gallery. Clips that used it keep their look.", title="Delete this template?",
                   buttons=[("Cancel", False), ("Delete", True)], role="app-dialog"):
            if state.call("template_delete", item["id"]) is not None:
                self.mine = [t for t in self.mine if t["id"] != item["id"]]
                self.mine_panel.items = self.mine
                self.no_mine.visible = not self.mine

    # ---- leaving with unsaved changes
    def _before_unload(self, event):
        if self.dirty:
            event.preventDefault()
            event.returnValue = ""

    @handle("", "show")
    def form_show(self, **event_args):
        window.addEventListener("beforeunload", self._before)

    @handle("", "hide")
    def form_hide(self, **event_args):
        window.removeEventListener("beforeunload", self._before)

    def leave(self):
        """router.show() calls this when another page opens: keep the changes (as the JavaScript version did)."""
        if self.dirty:
            try:
                self.save(quiet=True)
            except Exception:
                pass
