---
type: body
category: planet
orbits: "[[Sun]]"
moons: ["[[Callisto]]", "[[Europa]]", "[[Ganymede]]", "[[Io]]"]
visited_by: ["[[Pioneer 10]]", "[[Voyager 1]]", "[[Voyager 2]]", "[[Galileo]]", "[[New Horizons]]", "[[Juno]]", "[[JUICE]]", "[[Europa Clipper]]"]
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
    groupBy:
      property: agency
      direction: ASC
    depth: 1
    direction: outgoing
    height: 360

```
