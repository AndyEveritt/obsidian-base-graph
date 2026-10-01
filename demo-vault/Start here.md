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
11. **Task dependencies:** [[Tasks.base]] draws three project plans, for [[Europa]], [[Mars]] and [[Titan]], from their `blocked_by` links, clustered by `project` and coloured by status. [[Launch rotorcraft]] shares a launch with the Europa lander, so it's blocked by [[Book launch]] across the two clusters. **Both directions** adds `blocks` too.
12. **Rings:** the **Rings** view in [[Missions.base]] puts the two impactor missions, [[DART]] and [[Hera]], in the middle, with notes one and two links away in rings around them. Switch **Layout** back to **Free** to compare.
13. **Crew:** the **Crew** view in [[Missions.base]] follows `crew` links one step out from the crewed missions. [[Jim Lovell]] connects [[Apollo 8]] and [[Apollo 13]].
14. **Repeated links:** the **Mentions** view in [[Essays.base]] turns on **Scale links by link count**. [[The Grand Tour]] links [[Voyager 2]] six times but [[Titan]] once, so the line to [[Voyager 2]] is much thicker and pulls it in closer. Links between two notes that link to each other add up both directions. Turn the option off to compare.
15. **Top down:** the **Orbits** view in [[Solar system.base]] only follows `orbits`, which each body links to its parent. The [[Sun]] links to nothing, so it's on the top row, the planets are on the row below, and their moons below them. [[Dimorphos]] orbits [[Didymos]], so it's a row below it. The **Top down** view in [[Tasks.base]] does the same with `blocked_by`, with each project's first tasks, such as [[Define science goals]], at the top and its launch towards the bottom.
