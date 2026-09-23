---
type: body
category: moon
orbits: "[[Earth]]"
---
Earth's only natural satellite.

Orbits [[Earth]].

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
