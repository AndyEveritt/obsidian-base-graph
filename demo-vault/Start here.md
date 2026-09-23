# Base Graph demo vault

Run `npm run demo` in the plugin repo to build the plugin and copy it into this vault, then reload Obsidian.

## Shot list

1. **Overview:** open [[Everything.base]] on the **Graph** view. Every note, coloured by type.
2. **Filters:** open [[Missions.base]], select **Filters** in the toolbar and add `launched` ≥ `2000`. The graph updates as you edit.
3. **Depth:** in [[Missions.base]], drag the **Depth** slider from 0 to 2. Linked notes appear faded around the missions.
4. **Grouping:** switch **Group by** between `mission_type` and `agency`.
5. **Unresolved links:** the **Since 2010** view shows links to notes that don't exist yet, like [[Zhurong]].
6. **Embeds:** open [[Space exploration]] or [[Jupiter]] in reading view. The Jupiter graph uses `this.file`, so the same code block in [[Mars]], [[Saturn]] and [[Moon]] shows each world's own missions.
7. **Interaction:** hover to highlight neighbours, hold Ctrl/Cmd for a page preview, drag nodes, right-click for the file menu.
