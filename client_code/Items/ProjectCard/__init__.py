from anvil import *

from ._anvil_designer import ProjectCardTemplate
from ... import router, state


def fmt_len(seconds):
    s = int(round(seconds or 0))
    h, m, sec = s // 3600, (s % 3600) // 60, s % 60
    return "%d:%02d:%02d" % (h, m, sec) if h else "%d:%02d" % (m, sec)


class ProjectCard(ProjectCardTemplate):
    """A project on the Studio page. item = a project summary from RS.db.home() (server or this browser)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        p = self.item
        state.set_attr(self.card, "href", router.href("project", p["id"]))
        thumb = p.get("thumb") or ""
        if thumb:
            self.thumb.style["background-image"] = 'url("%s")' % thumb.replace('"', "%22")
        self.thumb.classes["sample"] = not thumb and bool(p.get("sample"))
        self.pip.visible = not thumb and bool(p.get("sample"))
        self.noimg.visible = not thumb and not p.get("sample")
        self.sample_tag.visible = bool(p.get("sample"))
        self.length.text = fmt_len(p.get("duration"))
        self.clips.text = state.plural(p.get("clip_count") or 0, "clip")
        self.ready.text = "%d ready" % (p.get("ready_count") or 0)
        self.ready_tag.visible = bool(p.get("ready_count"))
        self.exported.text = "%d exported" % (p.get("exported_count") or 0)
        self.exported_tag.visible = bool(p.get("exported_count"))
        self.when.text = state.ago(p.get("updated"))
