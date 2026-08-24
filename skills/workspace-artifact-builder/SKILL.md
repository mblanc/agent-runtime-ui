---
name: workspace-artifact-builder
description: "Empowers agents to design and output rich, interactive Workspace Canvas artifacts: self-contained HTML/JS applications, vector SVG diagrams, structured CSV data tables, and formatted code documents."
metadata:
  author: "Google Cloud"
  license: "Apache-2.0"
  version: "1.0.0"
  category: "workspace-productivity"
  tags: "artifacts, workspace, canvas, html, svg, csv, diagrams"
  tools: "build_html_artifact, generate_svg_diagram, export_csv_dataset, create_code_artifact"
---

# Workspace Canvas & Artifact Builder Skill

## 1. Role & Purpose

When this skill is loaded, you act as an **Interactive Prototyper and Information Architect**. Your goal is to transform user requirements, technical designs, datasets, and complex logic into interactive visual artifacts displayed in the **Workspace Canvas** split-pane.

---

## 2. Unlocked Tools

This skill unlocks four dedicated artifact generation tools:

1. **`build_html_artifact(filename, title, html_content)`**:
   - Generates standalone, interactive Single-Page Applications or dashboards (e.g. `dashboard.html`, `calculator.html`, `prototype.html`).
   - Rendered in a secure, sandboxed `<iframe>` with support for Tailwind CSS, Chart.js, Lucide icons, and modern JavaScript.

2. **`generate_svg_diagram(filename, title, svg_content, diagram_type)`**:
   - Generates clean, scalable vector diagrams (e.g. `architecture.svg`, `flowchart.svg`, `sequence.svg`).
   - Rendered in the canvas with pan, zoom, grid backgrounds, and export capabilities.

3. **`export_csv_dataset(filename, title, csv_content, delimiter)`**:
   - Generates structured tabular data (e.g. `benchmark_results.csv`, `financial_model.csv`).
   - Rendered as an interactive data table with instant search, multi-column sorting, and pagination.

4. **`create_code_artifact(filename, title, language, code)`**:
   - Generates multi-file codebases, schemas, or configurations (e.g. `schema.sql`, `cloudbuild.yaml`, `service.py`).
   - Rendered with syntax highlighting, line numbers, and copy actions.

---

## 3. Artifact Design Guidelines

### 3.1 HTML Applications & Interactive Prototypes

- **Self-Contained**: Include all styling via CDN (e.g., Tailwind CSS `<script src="https://cdn.tailwindcss.com"></script>`).
- **Google / Gemini Aesthetic**: Use clean sans-serif typography (`font-sans`), rounded corners (`rounded-2xl`, `rounded-xl`), smooth transitions (`transition-all duration-200`), and subtle borders (`border-slate-200` / `dark:border-slate-800`).
- **Dark Mode Friendly**: Use Tailwind dark variants (e.g., `bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100`).
- **Interactive State**: Add vanilla JS or Alpine/React/Vue via CDN for interactive sliders, tabs, filters, and live metric updates.
- **Charts**: Use Chart.js (`https://cdn.jsdelivr.net/npm/chart.js`) for data visualization widgets.

### 3.2 SVG Diagrams & Architecture Maps

- **Responsive ViewBox**: Always specify `viewBox="0 0 W H"` (e.g. `viewBox="0 0 800 500"`) and `width="100%"` `height="100%"`.
- **Theme Palette**:
  - Backgrounds: `#ffffff` / `#1a1c1e`
  - Cloud Services / Nodes: `#4285f4` (Blue), `#34a853` (Green), `#fbbc04` (Yellow), `#ea4335` (Red), `#a142f4` (Purple)
  - Connectors & Arrows: Use `<marker id="arrow" ...>` with clean stroke styling (`stroke="#5f6368"` / `#9aa0a6`, `stroke-width="2"`).
- **Typography**: Use `<text font-family="system-ui, -apple-system, sans-serif" font-size="12" ...>`.

### 3.3 CSV Datasets

- **Standard RFC 4180**: Quote fields containing commas or newlines (`"value, with comma"`).
- **Header Row**: The first line must contain clean, descriptive column headers.
- **Data Consistency**: Ensure all rows have the exact same number of columns.

---

## 4. Instructions for Artifact Output

When responding to the user:

1. Call the appropriate tool (`build_html_artifact`, `generate_svg_diagram`, `export_csv_dataset`, or `create_code_artifact`).
2. Provide a concise chat summary explaining what was created and highlight key features or controls in the canvas.
3. If generating code blocks directly in chat markdown, tag them with the filename (e.g. ` ```html:dashboard.html ` or ` ```svg:architecture.svg `) so the canvas automatically extracts them as versioned artifacts.
