from anvil import *
import anvil.server

from ._anvil_designer import TemplatesTemplate
from ... import rs, state


class Templates(TemplatesTemplate):
    """#templates: the gallery (Operate). Looks shared by creators (featured first, then most used) and Reelstuber's
    own looks. "Make it my default" puts a look into the brand kit (RS.db, so guests keep it in this browser)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        for panel in (self.community_panel, self.originals_panel):
            panel.add_event_handler("x-default", self._make_default)
            panel.add_event_handler("x-delete", self._delete)
        base = rs.full_style({"aspect": "9:16"})
        self.originals_panel.items = [{"t": look, "builtin": True, "style": rs.apply_look(base, look["style"], look["key"])}
                                      for look in rs.looks()]
        self.load()

    def load(self):
        r = state.call("templates_list") or {"templates": []}
        items = []
        for t in r.get("templates") or []:
            style = dict(t.get("style") or {})
            style["aspect"] = "9:16"
            items.append({"t": t, "builtin": False, "style": style})
        self.community_count.text = state.plural(len(items), "template")
        self.community_panel.items = items
        self.community_panel.visible = bool(items)
        self.no_community.visible = not items

    def _make_default(self, item, button, **event_args):
        t, builtin = item["t"], item["builtin"]
        button.enabled = False
        try:
            kit = dict(rs.db("brand").get("kit") or {})
            key = t["key"] if builtin else ((t.get("style") or {}).get("look") or "tpl")
            merged = rs.apply_look(rs.full_style(kit), t.get("style") or {}, key)
            for k in rs.lists()["lookKeys"] + ["look"]:
                if k in merged:
                    kit[k] = merged[k]
            rs.set_kit(rs.db("saveBrand", kit))
            if not builtin:
                try:
                    anvil.server.call_s("template_use", t["id"])
                except Exception:
                    pass
            state.toast("%s %s is now your default look" % (t.get("emoji") or "✨", t.get("name") or ""), "ok")
        except Exception as e:
            state.toast(rs.message(e), "error")
        button.enabled = True

    def _delete(self, item, **event_args):
        if confirm("", title="Delete this template?", buttons=[("Cancel", False), ("Delete", True)], role="app-dialog"):
            if state.call("template_delete", item["t"]["id"]) is not None:
                self.load()
