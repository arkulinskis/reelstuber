from anvil import *

from ._anvil_designer import CountRowTemplate


class CountRow(CountRowTemplate):
    """A name and a number (Admin -> Usage: popular looks, shapes). item = {name, n}."""

    def __init__(self, **properties):
        super().__init__(**properties)
