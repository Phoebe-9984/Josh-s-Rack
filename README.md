# Rack Elevation Designer

A standalone browser-based GUI for building network rack elevation diagrams. It runs locally with no build step, server, account, or internet connection.

## Start

1. Unzip the package.
2. Open `index.html` in a modern browser (Edge, Chrome, Firefox, or Safari).

For a local web server instead, run this command in the folder:

```bash
python3 -m http.server 8080
```

Then browse to `http://localhost:8080`.

## Capabilities

- Configure 6U–52U, 19-inch or 23-inch racks.
- Front and rear rack faces; equipment can occupy front, rear, or both.
- Add common presets or custom 1U–20U equipment.
- Automatic first-available placement and collision prevention.
- Drag equipment vertically with rack-unit snapping.
- Edit, duplicate, delete, color-code, annotate, and lock equipment.
- Rack utilization and installed-equipment list.
- Undo/redo and automatic local browser saving.
- Import/export project JSON.
- Export the elevation as SVG or PNG and the equipment schedule as CSV.
- Print-friendly layout.

## Data and privacy

Project data remains in the current browser's local storage unless you explicitly export it. No information is transmitted by this application.

## Project JSON

JSON export is the editable project format. Importing validates bounds, duplicate IDs, and front/rear placement conflicts before replacing the current project.

## Keyboard shortcuts

- `Ctrl/Cmd + Z`: Undo
- `Ctrl/Cmd + Shift + Z` or `Ctrl/Cmd + Y`: Redo
- `Delete` / `Backspace`: Delete selected equipment when not editing a field
- `Escape`: Clear selection

## Files

- `index.html` — GUI markup
- `styles.css` — visual design and print layout
- `core.js` — rack placement, validation, and CSV logic
- `app.js` — UI interaction, persistence, drag/drop, and exports
- `tests/core.test.js` — deterministic core logic tests
- `sample-42u.rack.json` — example project ready to import
