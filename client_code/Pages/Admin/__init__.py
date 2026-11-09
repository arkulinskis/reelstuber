from anvil import *

from ._anvil_designer import AdminTemplate
from ... import state

TABS = ["overview", "usage", "templates", "feedback", "users", "demo"]


class Admin(AdminTemplate):
    """#admin/<tab>: overview numbers, usage (reels per day, popular looks and shapes), template moderation, the old
    feedback inbox, users (admin / active switches) and the demo data. Each tab is its own address."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.tab = args[0] if args and args[0] in TABS else "overview"
        self._filter = "new"
        parts = {"overview": self.overview_part, "usage": self.usage_part, "templates": self.templates_part,
                 "feedback": self.feedback_part, "users": self.users_part, "demo": self.demo_part}
        tabs = {"overview": self.tab_overview, "usage": self.tab_usage, "templates": self.tab_templates,
                "feedback": self.tab_feedback, "users": self.tab_users, "demo": self.tab_demo}
        for name in TABS:
            parts[name].visible = name == self.tab
            tabs[name].classes["on"] = name == self.tab
        self.feedback_panel.add_event_handler("x-changed", self._feedback_changed)
        self.templates_panel.add_event_handler("x-changed", self._templates_changed)
        getattr(self, "_" + self.tab)()

    # ---- overview
    def _overview(self):
        d = state.call("admin_overview")
        if not d:
            return
        for name in ("users", "admins", "projects", "clips", "exports", "templates"):
            getattr(self, "s_" + name).text = str(d.get(name) or 0)
        self.s_feedback.text = str(d.get("feedback_new") or 0)
        self.s_admins_label.text = "admin" if d.get("admins") == 1 else "admins"
        self.demo_line.text = "Demo data is %s (%d demo people). Manage it in the Demo data tab." % (
            d["demo"]["state"], d["demo"]["counts"].get("users", 0))

    # ---- usage
    def _usage(self):
        d = state.call("admin_usage", 14)
        if not d:
            return
        top = max([1] + [x["n"] for x in d["per_day"]])
        self.u_total.text = str(d["total"])
        self.u_avg.text = "%ss" % d["avg_seconds"]
        self.u_captioned.text = "%d%%" % (round(d["captioned"] * 100.0 / d["clips"]) if d["clips"] else 0)
        self.bars_panel.items = [{"day": x["day"], "n": x["n"], "max": top} for x in d["per_day"]]
        self.u_demo.text = ("%d of all exports are demo data." % d["demo_exports"]) if d["demo_exports"] else ""
        self.u_demo.visible = bool(d["demo_exports"])
        self.looks_panel.items = [{"name": k, "n": v} for k, v in d["looks"]]
        self.no_looks.visible = not d["looks"]
        self.aspects_panel.items = [{"name": k, "n": v} for k, v in d["aspects"]]
        self.no_aspects.visible = not d["aspects"]

    # ---- templates
    def _templates(self):
        d = state.call("admin_templates")
        items = (d or {}).get("templates") or []
        self.templates_panel.items = items
        self.no_templates.visible = not items

    def _templates_changed(self, **event_args):
        self._templates()

    # ---- feedback
    def _feedback(self):
        d = state.call("list_feedback", None)
        if not d:
            return
        items = [i for i in d["items"] if self._filter == "all" or i["status"] == self._filter]
        self.feedback_panel.items = items
        self.no_feedback.visible = not items
        labels = {"new": "New", "read": "Read", "done": "Done", "all": "All"}
        for key, el in (("new", self.f_new), ("read", self.f_read), ("done", self.f_done), ("all", self.f_all)):
            n = len(d["items"]) if key == "all" else d["counts"].get(key, 0)
            el.text = "%s (%d)" % (labels[key], n)
            el.role = ["seg", "on"] if key == self._filter else ["seg"]

    def _set_filter(self, value):
        self._filter = value
        self._feedback()

    @handle("f_new", "click")
    def f_new_click(self, **event_args):
        self._set_filter("new")

    @handle("f_read", "click")
    def f_read_click(self, **event_args):
        self._set_filter("read")

    @handle("f_done", "click")
    def f_done_click(self, **event_args):
        self._set_filter("done")

    @handle("f_all", "click")
    def f_all_click(self, **event_args):
        self._set_filter("all")

    def _feedback_changed(self, **event_args):
        self._feedback()

    # ---- users
    def _users(self, query=None):
        d = state.call("list_users", query or None)
        if not d:
            return
        self.users_panel.items = d["users"]
        self.users_count.text = state.plural(d["total"], "person", "people")

    @handle("search_box", "pressed_enter")
    def search_box_pressed_enter(self, **event_args):
        self._users(self.search_box.text)

    @handle("search_button", "click")
    def search_button_click(self, **event_args):
        self._users(self.search_box.text)

    # ---- demo data
    def _demo(self):
        r = state.call("admin_overview")
        if not r:
            return
        d = r["demo"]
        counts = ", ".join("%s %s" % (v, k) for k, v in d["counts"].items())
        self.demo_status.text = "Status: %s · %s" % (d["state"], counts)
        self.demo_load_button.text = "Reload demo data" if d["state"] == "loaded" else "Load demo data"

    @handle("demo_load_button", "click")
    def demo_load_button_click(self, **event_args):
        if confirm("Demo people and content are added (any old demo rows are replaced).", title="Load the demo data?",
                   buttons=[("Cancel", False), ("Load", True)], role="app-dialog"):
            if state.call("demo_load"):
                state.toast("Done", "ok")
                self._demo()

    @handle("demo_remove_button", "click")
    def demo_remove_button_click(self, **event_args):
        if confirm("Every demo row is deleted. Real data stays.", title="Remove the demo data?",
                   buttons=[("Cancel", False), ("Remove", True)], role="app-dialog"):
            if state.call("demo_remove"):
                state.toast("Done", "ok")
                self._demo()
