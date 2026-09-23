# Base Graph

Adds a **Graph** view to [Obsidian Bases](https://help.obsidian.md/bases). The notes a base returns are drawn as a force-directed graph, like the core graph view.

- **Filters:** use the normal Bases toolbar to add, edit and remove filters. The graph updates as you change them.
- **Depth:** like the local graph, also show notes up to _n_ links away from the base's results. Choose whether to follow links, backlinks or both.
- **Groups:** if the base is grouped, each group gets its own colour and appears in the legend.
- **Embeds:** works anywhere a base does, including `![[Projects.base#Graph]]` and inline `base` code blocks.

Requires Obsidian 1.10.2 or later with the Bases core plugin turned on.

## Usage

1. Open a `.base` file. In the view switcher, select **Add view**, then choose **Graph**.
2. Set up filters from the toolbar as you would for a table.
3. Drag the **Depth** slider in the top right to include linked notes. They're drawn faded so you can tell them apart from notes the base matched.

Using the graph:

- Select a node to open it. Hold <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> to open it in a new tab.
- Drag nodes to move them. Scroll to zoom, and drag the background to pan.
- Hover with <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> held for a page preview.
- Right-click a node for the file menu.

### View options

These are under the view's settings in the Bases toolbar and are saved in the `.base` file.

| Option | Description |
| --- | --- |
| Depth | How many links away from the base's results to include (0–5). |
| Follow | Follow links, backlinks, or both when expanding depth. |
| Include attachments | Include linked attachments when expanding depth. |
| Show unresolved links | Show links to notes that don't exist. |
| Show orphans | Show results that aren't linked to anything in the graph. |
| Label property | Property to use as the node label. Defaults to the file name. |
| Size property | Numeric property that sets node size. Defaults to the number of links. |
| Display | Node size, link thickness, text fade threshold, arrows, height when embedded, and the node limit. |
| Forces | Center, repel and link forces, and link distance. |

### Embedding

Embed a view from a `.base` file:

```markdown
![[Projects.base#Graph]]
```

Or define the base inline. Filters can refer to the note it's embedded in with `this`. For example, this shows the notes linking to the current note and everything linked to them:

````markdown
```base
filters:
  and:
    - file.hasLink(this.file)
views:
  - type: base-graph
    name: Linked notes
    depth: 1
    height: 500
```
````

## Development

```bash
npm install
npm run dev     # watch build
npm run build   # production build
npm run lint
```

To test, copy `main.js`, `manifest.json` and `styles.css` to `<Vault>/.obsidian/plugins/base-graph/`, reload Obsidian, and turn on **Base Graph** in **Settings → Community plugins**.

### Layout

```
src/
  main.ts                 Registers the Bases view and hover source
  constants.ts
  graph/
    linkIndex.ts          Outgoing links, plus a lazily built backlink index
    buildGraph.ts         Base results → nodes and links, with depth expansion
    types.ts
  view/
    GraphBasesView.ts     The BasesView: rebuilds on data and link changes, opens files
    options.ts            View options and reading them from the view config
    controls.ts           Depth slider, fit button, status line and legend
  render/
    renderer.ts           d3-force simulation, zoom/pan, dragging, hit testing
    draw.ts               Canvas drawing
    theme.ts              Reads graph colours from the current theme
```
