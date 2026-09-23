---
type: body
category: planet
orbits: "[[Sun]]"
---
A gas giant known for its bright ring system.

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
