"""Brand kit (each person's default look for new clips) and the community templates gallery.

A template is a saved style (no video, no transcript) that its maker shares with everyone. Anyone can browse
and use them, even signed out; publishing needs an account. Admins can feature or hide templates
(Admin -> Templates). Demo templates come from DemoData.
"""
import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from . import DemoData, Styles

MAX_TEMPLATES_PER_PERSON = 20


def kit_of(user):
    row = app_tables.brand_kits.get(owner=user) if user else None
    return dict(row["kit"] or {}) if row else {}


@anvil.server.callable(require_user=True)
def brand_get():
    me = C.require_user()
    mine = app_tables.templates.search(tables.order_by("created", ascending=False), owner=me)
    return {"kit": kit_of(me), "templates": [template_dict(t, me) for t in mine]}


@anvil.server.callable(require_user=True)
def brand_save(kit):
    me = C.require_user()
    if not isinstance(kit, dict):
        return C.fail("Nothing to save.")
    clean = Styles.clean_kit(kit)
    row = app_tables.brand_kits.get(owner=me)
    if row is None:
        app_tables.brand_kits.add_row(owner=me, kit=clean, updated=C.now())
    else:
        row.update(kit=clean, updated=C.now())
    return C.ok(kit=clean)


# ------------------------------------------------------------------------------------------- templates
def template_dict(t, me=None):
    return {"id": t.get_id(), "name": t["name"], "emoji": t["emoji"] or "✨", "style": t["style"] or {},
            "uses": t["uses"] or 0, "featured": bool(t["featured"]), "hidden": bool(t["hidden"]),
            "by": C.name_of(t["owner"]), "demo": bool(t["is_demo"]), "created": C.iso(t["created"]),
            "mine": me is not None and t["owner"] == me, "can_delete": me is not None and (t["owner"] == me or C.is_admin(me))}


@anvil.server.callable
def templates_list():
    """The public gallery: featured first, then the most used."""
    DemoData.ensure_loaded()
    me = C.me()
    rows = [t for t in app_tables.templates.search() if not t["hidden"]]
    rows.sort(key=lambda t: (not t["featured"], -(t["uses"] or 0), C.iso(t["created"]) or ""))
    return {"templates": [template_dict(t, me) for t in rows[:120]]}


@anvil.server.callable(require_user=True)
def template_publish(name, emoji, style):
    me = C.require_user()
    name = C.text(name, 40)
    if len(name) < 2:
        return C.fail("Give your template a name (at least 2 characters).")
    style = Styles.clean(style)
    if not style:
        return C.fail("That template has no style to share.")
    if len(app_tables.templates.search(owner=me)) >= MAX_TEMPLATES_PER_PERSON:
        return C.fail("You can share up to %d templates. Delete an old one first." % MAX_TEMPLATES_PER_PERSON)
    if C.rate_limited("template_publish", 10, 3600):
        return C.fail("That's a lot of templates in one hour. Please try again later.")
    for k in ("hook", "part", "musicName"):  # personal bits stay out of a shared template
        style.pop(k, None)
    emoji = C.text(emoji, 8) or "✨"
    t = app_tables.templates.add_row(owner=me, name=name, emoji=emoji, style=style, uses=0, featured=False, hidden=False,
                                     created=C.now(), is_demo=False)
    return C.ok(template=template_dict(t, me))


@anvil.server.callable
def template_use(template_id):
    """Someone applied this template: count it (once per template per browser session)."""
    t = C.row_by_id(app_tables.templates, template_id)
    if t is None or t["hidden"]:
        return C.fail("That template isn't available any more.")
    used = anvil.server.session.get("used_templates") or []
    if template_id not in used and not C.rate_limited("template_use", 60, 3600):
        t["uses"] = (t["uses"] or 0) + 1
        anvil.server.session["used_templates"] = used + [template_id]
    return C.ok(template=template_dict(t, C.me()))


@anvil.server.callable(require_user=True)
def template_delete(template_id):
    me = C.require_user()
    t = C.row_by_id(app_tables.templates, template_id)
    if t is None:
        return C.ok()
    if t["owner"] != me and not C.is_admin(me):
        return C.fail("You can only delete your own templates.")
    t.delete()
    return C.ok()


@anvil.server.callable(require_user=True)
def admin_templates():
    me = C.require_admin()
    rows = app_tables.templates.search(tables.order_by("created", ascending=False))
    return {"templates": [dict(template_dict(t, me), owner_email=t["owner"]["email"] if t["owner"] and not t["is_demo"] else "") for t in rows]}


@anvil.server.callable(require_user=True)
def admin_template_set(template_id, featured=None, hidden=None):
    me = C.require_admin()
    t = C.row_by_id(app_tables.templates, template_id)
    if t is None:
        return C.fail("That template no longer exists.")
    if featured is not None:
        t["featured"] = bool(featured)
    if hidden is not None:
        t["hidden"] = bool(hidden)
    return C.ok(template=template_dict(t, me))
