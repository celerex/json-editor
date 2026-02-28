# Visual JSON Editor

A dependency-free, (optionally) schema-guided JSON editor that renders a visual form. It supports nested objects/arrays, optional JSON Schema guidance, and a default DOM renderer with customizable styling.

Check out the [demo](https://celerex.github.io/json-editor/demo.html) for the basic javascript version. There is also a demo of a [vue-based](https://celerex.github.io/json-editor/demo-vue.html) implementation.

jsDelivr (latest):

- ESM: https://cdn.jsdelivr.net/gh/celerex/json-editor@master/dist/editor.esm.js
- UMD (min): https://cdn.jsdelivr.net/gh/celerex/json-editor@master/dist/editor.umd.min.js
- CSS: https://cdn.jsdelivr.net/gh/celerex/json-editor@master/dist/editor.css


## Quick Start

```html
<link rel="stylesheet" href="./src/editor.css"/>
<div id="editor"></div>
<script type="module">
	import { createDomEditor } from "./src/editor.js";
	const schema = {
		title: "Profile",
		type: "object",
		properties: {
			name: { type: "string" },
			status: { enum: ["active", "paused"] },
			tags: { type: "array", items: { type: "string" } }
		},
		required: ["name"]
	}
	const editor = createDomEditor(
		{
			container: document.querySelector("#editor"),
			value: {},
			schema,
			defaultCollapsed: true,
			onChange(next) {
				console.log("json changed", next)
			}
		}
	)
	// later
	// editor.setValue({ name: "Ada" })
	// editor.setSchema(nextSchema)
	// editor.destroy()
</script>
```

## API

### `createDomEditor(options)`

Creates a DOM renderer and mounts it into `container`.

Options:

- `container` (required): DOM element
- `value`: initial JSON value
- `schema`: optional JSON Schema
- `lenient` (default `false`): allow adding keys not in schema
- `defaultCollapsed` (default `true`): start sections collapsed (root stays open)
- `onChange(value)`: called after each edit
- `onUpdate(value)`: same as `onChange`, for external sync
- `messages`: override message strings (for i18n)
- `messageResolver(key, params)`: custom message function
- `classes`: additional class names per element type

Returns an editor instance with:

- `setValue(value)`
- `setSchema(schema)`
- `subscribe(fn)` (returns unsubscribe)
- `destroy()`

### `createEditorCore(options)`

Creates a core editor and emits UI trees via `onRender`. Use this if you want to build your own renderer.

Options are the same as above plus:

- `onRender(tree)` — receives the UI tree on each update

## Styling

### CSS Variables (easy theming)

Default styles are in `src/editor.css`. Override any `--je-*` variable to theme.

```css
:root {
	--je-page-bg: #12110f;
	--je-panel-bg: #1b1916;
	--je-text-primary: #f2e9dc;
	--je-input-bg: #211e1a;
	--je-input-border: #3a332c;
	--je-tooltip-bg: #0f0e0c;
}
```

### Custom Classes

You can add classes per element in `createDomEditor({ classes })`:

```js
createDomEditor({
  container,
  value: {},
  schema,
  classes: {
    field: "my-field",
    input: "my-input",
    remove: "my-remove",
    row: "my-row",
    arrayRow: "my-array-row",
    docIcon: "my-doc"
  }
})
```

Supported keys:
`field`, `object`, `array`, `row`, `arrayRow`, `label`, `docIcon`, `input`, `remove`, `move`, `header`, `title`, `badge`, `description`, `body`, `addRow`, `addButton`, `key`, `value`, `warning`, `error`, `toggle`

## Custom Components / Renderers

This project is framework-agnostic by design. The core editor generates a UI-level tree and node methods (update/add/remove/etc.).

- Use `createEditorCore({ onRender })` to receive that tree.
- Build your own renderer that maps nodes to your UI library.

### Vue Example (conceptual)

```js
import { createEditorCore } from "./src/editor.js"

const editor = createEditorCore({
  value: {},
  schema,
  onRender(tree) {
    // store tree in Vue state
    appState.tree = tree
  }
})

// In Vue component, render based on `appState.tree`
// Use node methods: node.update(value), node.addItem(option), node.toggle(), etc.
```

### Plugging Custom Field Controls

In a custom renderer, map by `node.kind`:

- `field` → input control
- `object` → collapsible section
- `array` → list of items + add controls

Each node provides methods like `update`, `remove`, `addItem`, `addField`, and `toggle`.

## UI Hints

This editor supports a simple UI hint for multiline text:

- `"ui:widget": "textarea"`

Example:

```json
{
	"type": "string",
	"title": "Notes",
	"ui:widget": "textarea"
}
```

## Validation Messages (i18n)

You can override validation copy using `messages` or `messageResolver`:

```js
createDomEditor({
  container,
  value: {},
  schema,
  messages: {
    invalid: "Ungültig",
    required: "Fehlend: {fields}",
    min: "Muss ≥ {min} sein"
  }
})
```

Or use a function:

```js
createDomEditor({
  container,
  value: {},
  schema,
  messageResolver(key, params) {
    if (key === "min") return `At least ${params.min}`
    return "Invalid"
  }
})
```

## Demo

Open `demo.html` using a local server:

```bash
python3 -m http.server 8080
```

Then visit: `http://localhost:8080/demo.html`

## Hidden Shortcut

Hold `Shift` while clicking a section toggle to expand/collapse the entire subtree.

## Build

Build ESM/UMD bundles and copy CSS into `dist/`:

```bash
npm install
npm run build
```

Outputs:

- `dist/editor.esm.js`
- `dist/editor.umd.js`
- `dist/editor.umd.min.js`
- `dist/editor.css`

## UMD Usage (No Module System)

```html
<link rel="stylesheet" href="./dist/editor.css"/>
<div id="editor"></div>
<script src="./dist/editor.umd.min.js"></script>
<script>
	const schema = { type: "object", properties: { name: { type: "string" } } }
	const editor = JsonEditor.createDomEditor({ container: document.querySelector("#editor"), value: {}, schema })
</script>
```
