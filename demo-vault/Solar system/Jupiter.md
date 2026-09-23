---
type: body
category: planet
orbits: "[[Sun]]"
---
The largest planet, a gas giant with dozens of moons.

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
