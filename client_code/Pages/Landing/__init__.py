from anvil import *
import anvil.js

from ._anvil_designer import LandingTemplate
from ... import rs, state

# The app's video on the Addanapp YouTube channel (APP_MAKER/youtube/manifest.json), shown in the Watch section.
YT_VIDEO = "pjALr5WpIvM"


class Landing(LandingTemplate):
    """#landing (Persuade; also "About" for members): the pitch, the before/after stage (one long video vs the three
    reels cut from it, drawn by the app's own renderer: drag to compare), the Watch section, how it works, features,
    questions. Static copy lives in the template."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        if state.me():
            self.dom_nodes["cta_text"].textContent = "Open the Studio"
        self.dom_nodes["yt_cover"].addEventListener("click", self._play)
        self.dom_nodes["ba_range"].addEventListener("input", self._drag)
        self._drawn = False

    @handle("", "show")
    def form_show(self, **event_args):
        if self._drawn:
            return
        self._drawn = True
        self.dom_nodes["long_img"].src = rs.RS.demoSource().toDataURL("image/png")
        looks = rs.looks()
        for comp, look, hook, t in ((self.reel1, looks[0], "Wait for it… 👀", 1.4), (self.reel2, looks[1], "", 1.2),
                                    (self.reel3, looks[4], "Story time 🍿", 2.2)):
            style = rs.apply_look(rs.full_style({"aspect": "9:16", "handle": "@pip"}), look["style"], look["key"])
            comp.draw(style, {"width": 210, "hook": hook, "t": t})

    def _drag(self, event):
        self.dom_nodes["ba"].style.setProperty("--x", "%s%%" % event.target.value)

    @handle("sample_button", "click")
    def sample_button_click(self, **event_args):
        rs.start_sample()

    def _play(self, event):
        """Swap the video's cover for YouTube's player (privacy-enhanced); nothing loads from YouTube before this click."""
        self.dom_nodes["yt_frame"].innerHTML = (
            '<iframe src="https://www.youtube-nocookie.com/embed/' + YT_VIDEO + '?autoplay=1&rel=0&playsinline=1" '
            'title="Reelstuber video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen '
            'referrerpolicy="strict-origin-when-cross-origin"></iframe>')
