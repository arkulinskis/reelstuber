from anvil import *

from ._anvil_designer import LookTileTemplate
from ... import state


class LookTile(LookTileTemplate):
    """A built-in look in the brand kit. item = {look, on, style}; a click raises x-look with the look."""

    def __init__(self, **properties):
        super().__init__(**properties)
        look = self.item["look"]
        self.label.text = "%s %s" % (look.get("emoji") or "", look.get("name") or "")
        on = bool(self.item.get("on"))
        self.tile.classes["on"] = on
        state.set_attr(self.tile, "aria-pressed", "true" if on else "false")
        state.set_attr(self.tile, "data-key", look.get("key"))
        self.preview.draw(self.item["style"], {"width": 120, "hook": ""})

    def tile_click(self, event):
        if self.parent is not None:
            self.parent.raise_event("x-look", look=self.item["look"])
