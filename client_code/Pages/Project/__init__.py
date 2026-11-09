from anvil import *

from ._anvil_designer import ProjectTemplate


class Project(ProjectTemplate):
    """#project/<id>[/find]: one video's page (player + timeline, Find reels, chapters, captions,
    the clip list, export all), a JavaScript engine in Components/Screen (theme/assets/rs-screens.js)."""

    waits = True  # router: the screen sets UI_READY itself once it has loaded

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.screen.mount(list(args))
