from anvil import *

from ._anvil_designer import AdminTemplateRowTemplate
from ... import state


class AdminTemplateRow(AdminTemplateRowTemplate):
    """A shared template in Admin -> Templates: feature it, hide it, delete it."""

    def __init__(self, **properties):
        super().__init__(**properties)
        t = self.item
        self.by.text = "by %s" % (t.get("by") or "someone")
        self.email.text = t.get("owner_email") or ""
        self.email.visible = bool(t.get("owner_email"))
        self.demo_tag.visible = bool(t.get("demo"))
        self.uses.text = state.plural(t.get("uses") or 0, "use")

    def _set(self, box, featured, hidden):
        r = state.call("admin_template_set", self.item["id"], featured, hidden)
        if r is None:
            box.checked = not box.checked
        else:
            state.toast("Saved", "ok")

    @handle("featured_box", "change")
    def featured_box_change(self, **event_args):
        self._set(self.featured_box, self.featured_box.checked, None)

    @handle("hidden_box", "change")
    def hidden_box_change(self, **event_args):
        self._set(self.hidden_box, None, self.hidden_box.checked)

    @handle("delete_button", "click")
    def delete_button_click(self, **event_args):
        if confirm("", title="Delete this template?", buttons=[("Cancel", False), ("Delete", True)], role="app-dialog"):
            if state.call("template_delete", self.item["id"]) is not None:
                self.parent.raise_event("x-changed")
