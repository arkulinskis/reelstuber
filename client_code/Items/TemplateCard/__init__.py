from anvil import *

from ._anvil_designer import TemplateCardTemplate
from ... import rs, state


class TemplateCard(TemplateCardTemplate):
    """A look in the Templates gallery. item = {"t": template or built-in look, "builtin": bool, "style": the full
    style to draw}. The page listens for x-default / x-delete on the RepeatingPanel."""

    def __init__(self, **properties):
        super().__init__(**properties)
        t, builtin = self.item["t"], self.item["builtin"]
        self.title.text = "%s %s" % (t.get("emoji") or "✨", t.get("name") or "")
        self.by.text = "Reelstuber original" if builtin else "by %s · %s" % (t.get("by") or "someone",
                                                                            state.plural(t.get("uses") or 0, "use"))
        self.featured.visible = bool(t.get("featured"))
        self.delete_button.visible = bool(t.get("can_delete"))
        state.set_control_attr(self.delete_button, "aria-label", "Delete %s" % (t.get("name") or "this template"))
        self.preview.draw(self.item["style"], {"width": 180, "hook": ""})

    @handle("default_button", "click")
    def default_button_click(self, **event_args):
        self.parent.raise_event("x-default", item=self.item, button=self.default_button)

    @handle("delete_button", "click")
    def delete_button_click(self, **event_args):
        self.parent.raise_event("x-delete", item=self.item)
