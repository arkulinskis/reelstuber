from anvil import *

from ._anvil_designer import StylePreviewTemplate
from ... import rs


class StylePreview(StylePreviewTemplate):
    """A reel still in a given style (canvas drawn by RS.stylePreview)."""

    def __init__(self, **properties):
        self.label = ""
        super().__init__(**properties)
        cv = self.dom_nodes["canvas"]
        if self.label:
            cv.setAttribute("role", "img")
            cv.setAttribute("aria-label", self.label)
        else:
            cv.setAttribute("aria-hidden", "true")

    def draw(self, style, opts=None):
        rs.preview(self.dom_nodes["canvas"], style, opts or {})
