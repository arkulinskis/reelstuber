from anvil import *

from ._anvil_designer import UsageBarTemplate
from ... import state


class UsageBar(UsageBarTemplate):
    """One day in Admin -> Usage. item = {day, n, max}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        d = self.item
        self.fill.style["height"] = "%d%%" % round(d["n"] * 100.0 / max(1, d["max"]))
        self.day.text = d["day"][8:]
        state.set_attr(self.bar, "title", "%s: %d" % (d["day"], d["n"]))
