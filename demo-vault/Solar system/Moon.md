---
type: body
category: moon
orbits: "[[Earth]]"
visited_by: ["[[Apollo 8]]", "[[Apollo 11]]", "[[Apollo 13]]", "[[Chang'e 4]]", "[[Artemis I]]", "[[Chandrayaan-3]]"]
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
