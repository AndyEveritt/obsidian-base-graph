---
type: body
category: planet
orbits: "[[Sun]]"
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
