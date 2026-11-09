from anvil import *

from ._anvil_designer import MyTemplateRowTemplate
from ... import state


class MyTemplateRow(MyTemplateRowTemplate):
    """A template you shared (brand kit page). item = {id, name, emoji, uses, hidden, featured}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        t = self.item
        self.meta.text = state.plural(t.get("uses") or 0, "use") + (" · hidden by an admin" if t.get("hidden") else "") + (
            " · ⭐ featured" if t.get("featured") else "")

    @handle("delete_button", "click")
    def delete_button_click(self, **event_args):
        self.parent.raise_event("x-delete", item=self.item)
