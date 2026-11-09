"""The app starts here (anvil.yaml: startup module). One server call to learn who is signed in (Anvil's loading
spinner shows meanwhile), the Privacy & Terms kit, the bridge to the JavaScript engines, then the page for the address
in the browser bar."""
import anvil.server

from . import legal, router, rs, state

LEGAL_THEME = {"accent": "#D01F69"}  # colours for the Privacy & Terms page (the text-safe pink, --c-link in app.css)

legal.setup(LEGAL_THEME)
rs.setup()
state.set_me(anvil.server.call("get_me"))
if state.me():
    legal.refresh_soon()
router.start()
