---
name: disnake-components-v2
description: >-
  Build Discord bot messages and modals with disnake's new Components V2 layout
  system (disnake >= 2.11). Use when the user works with disnake and mentions
  Components V2, ui.Container, ui.Section, ui.TextDisplay, ui.MediaGallery,
  ui.Thumbnail, ui.Separator, ui.File, ui.Label, the is_components_v2 flag,
  "new components", "layout components", accessory thumbnails, or wants rich
  message layouts without classic content/embeds.
---

# disnake — Components V2

Authoritative, verified-against-source guidance for disnake's **Components V2**
(a.k.a. layout components), added in **disnake 2.11** (PR #1294). These replace
the classic `content` + `embeds` layout with a composable component tree.

## Hard requirements & non-negotiable rules

1. **Requires `disnake >= 2.11`.** If unsure, verify the installed version
   (`import disnake; disnake.__version__`) before using these classes — do NOT
   assume they exist on older versions.
2. **The `is_components_v2` flag is set automatically** the moment you pass V2
   components to a send/edit method. **It is irreversible** for that message.
3. **V2 is mutually exclusive with `content`, `embeds`, `stickers`, and `poll`.**
   Passing both raises `ValueError: Cannot use v2 components with content or embeds`.
   - When **editing** a message that already had `content`/`embeds`, explicitly
     set them to `None`.
4. **Limits:** max **40** total components per message (counted across the whole
   tree); a `MediaGallery` holds up to **10** items.
5. V2 components are **non-interactive by themselves**. Buttons and select menus
   still live inside an `ActionRow` (same as V1) — put the `ActionRow` at the top
   level or inside a `Container`.
6. Do not invent methods. The verified surface is listed below; if you need
   something outside it, check the disnake docs rather than guessing.

## Component reference (verified)

All layout classes live under `disnake.ui`. Media items live under `disnake`.

| Class | Type | Purpose | Allowed children / notes |
|---|---|---|---|
| `ui.Container` | 17 | Embed-like styled wrapper grouping components | children: `ActionRow`, `Section`, `TextDisplay`, `MediaGallery`, `File`, `Separator`. Params: `accent_colour` (alias `accent_color`), `spoiler` |
| `ui.Section` | 9 | Text alongside a single accessory | 1–3 `TextDisplay` + `accessory=` a `ui.Thumbnail` **or** `ui.Button` |
| `ui.TextDisplay` | 10 | Markdown text (replaces `content`) | `TextDisplay("**bold** text")`; supports headings `#` |
| `ui.Thumbnail` | 11 | Small accessory image | `ui.Thumbnail(media="https://...", description=...)`; used only as a Section accessory |
| `ui.MediaGallery` | 12 | Grid of up to 10 media items | `ui.MediaGallery(*items)` where items are `disnake.MediaGalleryItem` |
| `ui.File` | 13 | Displays an uploaded attachment | `ui.File(file="attachment://name.png")` — **attachment refs only**, no external URLs; pair with `files=[disnake.File(...)]` |
| `ui.Separator` | 14 | Vertical spacing / divider | `ui.Separator(spacing=disnake.SeparatorSpacingSize.large, divider=True)` |
| `ui.ActionRow` | 1 | Row of interactive components | buttons / selects, same as V1 |

Signatures verified against source:

- `ui.Container(*components, accent_colour=None, spoiler=False, id=0)`
- `ui.MediaGallery(*items: disnake.MediaGalleryItem, id=0)`
- `disnake.MediaGalleryItem(media="https://...", description=None, spoiler=False)`
- `ui.File(file, *, spoiler=False, id=0)` — `file` must start with `attachment://`, otherwise raises `ValueError`.

## Sending V2 components

Pass a `components=[...]` list to any standard send/edit method. The flag is
handled for you.

```python
import disnake
from disnake.ext import commands
from disnake import ui

bot = commands.InteractionBot()

@bot.slash_command(name="profile")
async def profile(inter: disnake.ApplicationCommandInteraction):
    components = [
        ui.Container(
            ui.TextDisplay("# Player Profile\nRich layout, no embeds."),
            ui.Separator(spacing=disnake.SeparatorSpacingSize.large),
            ui.Section(
                ui.TextDisplay("**Name:** Cyx\n**Rank:** Diamond"),
                accessory=ui.Thumbnail(
                    media="https://placekitten.com/128/128",
                    description="avatar",
                ),
            ),
            ui.MediaGallery(
                disnake.MediaGalleryItem(media="https://placecats.com/900/600", description="clip 1"),
                disnake.MediaGalleryItem(media="https://placecats.com/800/600", description="clip 2", spoiler=True),
            ),
            ui.ActionRow(
                disnake.ui.Button(label="Open", style=disnake.ButtonStyle.primary, custom_id="open"),
            ),
            accent_colour=disnake.Colour(0xEE99CC),
        )
    ]
    # is_components_v2 is set automatically; do NOT also pass content/embeds
    await inter.response.send_message(components=components)
```

### Setting the flag manually (rarely needed)

```python
await channel.send(
    components=[ui.TextDisplay("hi")],
    flags=disnake.MessageFlags(is_components_v2=True),
)
```
Only `suppress_embeds`, `suppress_notifications`, and `is_components_v2` are
supported on `MessageFlags` for messages.

### Displaying an uploaded file

```python
await inter.response.send_message(
    components=[
        ui.Container(
            ui.TextDisplay("Here is your report:"),
            ui.File(file="attachment://report.pdf"),
        )
    ],
    files=[disnake.File("report.pdf")],
)
```

## Editing messages that had content/embeds

```python
# message previously used classic content/embeds -> null them out
await message.edit(
    content=None,
    embeds=None,
    components=[ui.Container(ui.TextDisplay("Updated via V2"))],
)
```

## Modals (V2 in modals)

- `ui.Label` wraps **one** input (`TextInput`, or a select menu) with a label +
  optional description.
- `ui.TextDisplay` can be a top-level component inside a modal.
- Select menus (`ui.StringSelect`, `ui.UserSelect`, etc.) are usable in modals
  **only when wrapped in a `ui.Label`**; use the modal-specific `required=` to
  make them optional.
- Read submitted values from `ModalInteraction.resolved_values` (raw:
  `ModalInteraction.resolved_values`), and note `ModalInteraction.walk_components`
  was replaced by `ModalInteraction.walk_raw_components()`.

```python
class FeedbackModal(disnake.ui.Modal):
    def __init__(self):
        components = [
            ui.TextDisplay("## We value your feedback"),
            ui.Label(
                "How was it?",
                component=disnake.ui.StringSelect(
                    options=["Great", "Okay", "Bad"], custom_id="rating"
                ),
                description="Pick one",
            ),
            ui.Label(
                "Comments",
                component=disnake.ui.TextInput(
                    style=disnake.TextInputStyle.paragraph, custom_id="comments"
                ),
            ),
        ]
        super().__init__(title="Feedback", components=components)

    async def callback(self, inter: disnake.ModalInteraction):
        values = inter.resolved_values
        await inter.response.send_message(
            components=[ui.TextDisplay(f"Thanks! {values}")]
        )
```

## Inspecting received messages

- `disnake.ui.walk_components(components)` — iterate the whole tree.
- `disnake.ui.components_from_message(message)` — reconstruct `ui.*` objects from
  an API message so you can edit and resend them.
- Every component has an optional per-message numeric `id` (0 = let API assign).

## Common errors → fixes

| Symptom | Cause | Fix |
|---|---|---|
| `ValueError: Cannot use v2 components with content or embeds` | Passed `content`/`embeds` alongside `components` | Remove them; put text in `ui.TextDisplay`. On edit, set them to `None`. |
| `ValueError: File component only supports attachment:// references` | Gave `ui.File` an external URL | Use `attachment://name` + `files=[disnake.File(...)]`, or use `MediaGallery`/`Thumbnail` for external URLs |
| `AttributeError` on `ui.Container`/`ui.Section` etc. | disnake < 2.11 | Upgrade disnake |
| Message renders as plain V1 | Flag not set because no V2 component was actually passed | Ensure at least one top-level V2 component is in `components` |
| Buttons don't appear | Placed interactive components as bare list items | Wrap them in `ui.ActionRow` |

## Sources
- disnake 2.11 changelog: https://docs.disnake.dev/en/v2.11.0/whats_new.html
- disnake source (`disnake/ui/container.py`, `file.py`, `media_gallery.py`)
- Discord components reference: https://discord.com/developers/docs/components/reference
