# Base Graph demo vault

Run `npm run demo` in the plugin repo to build the plugin and copy it into this vault, then reload Obsidian.

## Shot list

1. **Overview:** open [[Everything.base]] on the **Graph** view. Every note, coloured and clustered by folder.
2. **Filters:** open [[Missions.base]], select **Filters** in the toolbar and add `launched` ≥ `2000`. The graph updates as you edit.
3. **Depth:** in [[Missions.base]], drag the **Depth** slider from 0 to 2. Linked notes appear faded around the missions.
4. **Grouping:** switch **Group by** between `mission_type` and `agency`.
5. **Unresolved links:** the **Since 2010** view shows links to notes that don't exist yet, like [[Zhurong]].
6. **Embeds:** open [[Space exploration]] or [[Jupiter]] in reading view. The Jupiter graph uses `this.file`, so the same code block in [[Mars]], [[Saturn]] and [[Moon]] shows each world's own missions.
7. **Interaction:** hover to highlight neighbours, hold Ctrl/Cmd for a page preview, drag nodes, right-click for the file menu.
8. **Hover card:** hover a mission in [[Missions.base]] to see its agency, launch year and targets. Select the pin to keep it highlighted.
9. **Clusters:** the [[Missions.base]] graph is coloured by mission type but clustered by agency, with a labelled outline around each agency.
10. **Link properties:** the **Relationships** view in [[Everything.base]] only draws links from properties, each in its own colour. [[DART]] and [[Didymos]] link both ways, through `targets` and `visited_by`, so they get parallel arrows.
11. **Task dependencies:** [[Tasks.base]] draws the [[Europa]] lander plan from its `blocked_by` links. **Both directions** adds `blocks` too.
12. **Rings:** the **Rings** view in [[Missions.base]] puts the two impactor missions, [[DART]] and [[Hera]], in the middle, with notes one and two links away in rings around them. Switch **Layout** back to **Free** to compare.
13. **Crew:** the **Crew** view in [[Missions.base]] follows `crew` links one step out from the crewed missions. [[Jim Lovell]] connects [[Apollo 8]] and [[Apollo 13]].
