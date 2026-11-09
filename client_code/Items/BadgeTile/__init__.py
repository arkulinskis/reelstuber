from anvil import *

from ._anvil_designer import BadgeTileTemplate


class BadgeTile(BadgeTileTemplate):
    """A badge on the Studio page: item = {key, emoji, name, desc, got}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.tile.classes["got"] = bool(self.item.get("got"))
        self.got_sr.text = "Earned" if self.item.get("got") else "Not earned yet"
