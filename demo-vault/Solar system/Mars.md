---
type: body
category: planet
orbits: "[[Sun]]"
moons: ["[[Deimos]]", "[[Phobos]]"]
visited_by: ["[[Viking 1]]", "[[Mars Express]]", "[[Opportunity]]", "[[Spirit]]", "[[Curiosity]]", "[[Mars Orbiter Mission]]", "[[Ingenuity]]", "[[Perseverance]]", "[[Tianwen-1]]"]
---
The red planet, home to Olympus Mons, the tallest volcano in the solar system.

Orbits [[Sun]].

## Missions

```base
filters:
  and:
    - type == "mission"
    - file.hasLink(this.file)
views:
  - type: base-graph
    name: Missions to this world
    depth: 1
    direction: outgoing
    height: 360
```
