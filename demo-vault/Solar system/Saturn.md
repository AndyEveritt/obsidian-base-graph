---
type: body
category: planet
orbits: "[[Sun]]"
moons: ["[[Enceladus]]", "[[Titan]]"]
visited_by: ["[[Voyager 1]]", "[[Voyager 2]]", "[[Cassini-Huygens]]"]
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
