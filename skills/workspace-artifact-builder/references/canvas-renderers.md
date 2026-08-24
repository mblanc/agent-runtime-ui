# Workspace Canvas Renderers & Capabilities Reference

The `agent-runtime-ui` Workspace Canvas supports specialized visual renderers based on the artifact's MIME type and filename extension.

---

## 1. Supported Renderers

| Renderer | File Extensions | MIME Type | Key Features |
| :--- | :--- | :--- | :--- |
| **HTML Iframe Sandbox** | `.html`, `.htm` | `text/html` | Sandboxed execution, Tailwind CSS, Alpine.js, Chart.js, Lucide icons |
| **SVG Vector Canvas** | `.svg` | `image/svg+xml` | Pan, zoom, grid background, PNG/SVG download |
| **CSV Data Table** | `.csv`, `.tsv` | `text/csv`, `text/tab-separated-values` | Instant search, multi-column sort, pagination, copy |
| **Code Syntax Highlighter** | `.py`, `.ts`, `.js`, `.sql`, `.yaml`, `.json` | `text/x-*`, `application/json` | Shiki engine, line numbers, one-click copy |
| **Markdown Document** | `.md`, `.markdown` | `text/markdown` | GFM tables, GitHub alerts, inline math, mermaid diagrams |

---

## 2. Best Practices for Generated HTML Prototypes

When generating `.html` artifacts:

1. **Include CDN Styles & Scripts**:
   ```html
   <!DOCTYPE html>
   <html lang="en">
   <head>
     <meta charset="UTF-8">
     <meta name="viewport" content="width=device-width, initial-scale=1.0">
     <script src="https://cdn.tailwindcss.com"></script>
     <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
   </head>
   <body class="bg-slate-50 text-slate-900 font-sans p-6">
     <!-- App content -->
   </body>
   </html>
   ```

2. **Self-Contained Logic**: Keep JavaScript functions and event listeners inside the `<script>` tag of the HTML document.

---

## 3. Best Practices for Generated SVG Diagrams

1. **Root Attributes**: Always define `viewBox="0 0 800 500"` and `xmlns="http://www.w3.org/2000/svg"`.
2. **Def Blocks**: Include `<defs>` for arrow markers and linear gradients:
   ```xml
   <defs>
     <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
       <path d="M 0 0 L 10 5 L 0 10 z" fill="#5f6368" />
     </marker>
   </defs>
   ```
