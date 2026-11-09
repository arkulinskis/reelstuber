from anvil import *

from ._anvil_designer import ChipTemplate
from ... import state


class Chip(ChipTemplate):
    """One choice in a row of chips (the brand kit). item = {key, value, label, on}; a click raises x-chip on the
    RepeatingPanel with key and value."""

    def __init__(self, **properties):
        super().__init__(**properties)
        on = bool(self.item.get("on"))
        self.chip.classes["on"] = on
        state.set_attr(self.chip, "aria-pressed", "true" if on else "false")
        state.set_attr(self.chip, "data-key", "%s:%s" % (self.item["key"], self.item["value"]))

    def chip_click(self, event):
        if self.parent is not None:
            self.parent.raise_event("x-chip", key=self.item["key"], value=self.item["value"])
