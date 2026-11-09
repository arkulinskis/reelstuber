from anvil import *

from ._anvil_designer import ClipTemplate


class Clip(ClipTemplate):
    """#clip/<project id>/<clip id>: the reel editor (tabs Look / Captions / Text / Stickers / FX / Sound /
    Post, text and stickers dragged on the preview, export), a JavaScript engine in Components/Screen (rs-screens.js)."""

    waits = True  # router: the screen sets UI_READY itself once it has loaded

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.screen.mount(list(args))
