from anvil import *

from ._anvil_designer import HomeTemplate
from ... import rs, state


class Home(HomeTemplate):
    """#home, the Studio (Operate; open to guests, whose projects live in this browser through RS.db): drop a video or
    try the sample (the drop zone is wired by RS.wireDrop in rs-kit.js, which runs RS.startProject), your projects,
    stats and badges, and moving a guest's projects into the account after signing up (RS.importLocal)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        rs.RS.wireDrop(self.dom_nodes["drop"], self.dom_nodes["file"])
        self.no_export.visible = not rs.lists().get("canExport")
        self.load()

    def load(self):
        try:
            d = rs.db("home")
        except Exception as e:
            state.toast(rs.message(e), "error")
            d = {"projects": [], "stats": {}, "badges": [], "brand": {}}
        self.draw(d)

    def draw(self, d):
        me = state.me()
        rs.set_kit(d.get("brand") or {})
        s = d.get("stats") or {}
        self.hello.text = ("Hey %s, got a long one? ✂️" % ((me.get("name") or "there").split(" ")[0])) if me else "Let's chop a video ✂️"
        state.heading(self.hello, 1)
        streak = s.get("streak") or 0
        self.streak_tag.visible = bool(streak)
        self.streak_text.text = "%d-day streak" % streak
        self.guest_banner.visible = not me
        local = rs.db("localProjects") if me else []
        self.import_banner.visible = bool(local)
        if local:
            self.import_text.text = "📦 %s from before you signed in %s still in this browser." % (
                state.plural(len(local), "project"), "is" if len(local) == 1 else "are")
        projects = d.get("projects") or []
        self.s_exports.text = str(s.get("exports") or 0)
        self.s_minutes.text = str(s.get("minutes_saved") or 0)
        self.s_streak.text = "%d 🔥" % streak
        self.s_projects.text = str(len(projects))
        self.s_projects_label.text = "project" if len(projects) == 1 else "projects"
        self.projects_count.text = state.plural(len(projects), "video") if projects else ""
        self.projects_panel.items = projects
        self.projects_panel.visible = bool(projects)
        self.no_projects.visible = not projects
        badges = d.get("badges") or []
        self.badges_count.text = "%d of %d" % (len([b for b in badges if b.get("got")]), len(badges))
        self.badges_panel.items = badges

    @handle("import_no", "click")
    def import_no_click(self, **event_args):
        self.import_banner.visible = False

    @handle("import_button", "click")
    def import_button_click(self, **event_args):
        self.import_button.enabled = False
        try:
            n = rs.RS.importLocal()
            state.toast("Moved %s to your account." % state.plural(int(n or 0), "project"), "ok")
            self.load()
        except Exception as e:
            state.toast(rs.message(e), "error")
        self.import_button.enabled = True
