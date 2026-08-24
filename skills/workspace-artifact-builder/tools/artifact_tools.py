"""ADK Tools for the Workspace Artifact Builder Skill."""

from typing import Any, Dict, Optional


def build_html_artifact(
    filename: str,
    title: str,
    html_content: str,
    description: Optional[str] = None,
) -> Dict[str, Any]:
    """Generates an interactive HTML single-page application or dashboard for the Workspace Canvas.

    Args:
        filename: Target filename ending in .html (e.g. 'dashboard.html', 'calculator.html').
        title: Human-readable display title for the artifact tab (e.g. 'FinOps Cost Dashboard').
        html_content: Complete, self-contained HTML5 code including styles and scripts.
        description: Brief summary of the application or components contained.

    Returns:
        Structured artifact payload for the Agent Runtime UI canvas.
    """
    clean_filename = filename if filename.endswith(".html") else f"{filename}.html"
    return {
        "status": "success",
        "artifact": {
            "filename": clean_filename,
            "title": title or clean_filename,
            "mimeType": "text/html",
            "content": html_content,
            "description": description or f"Interactive HTML artifact: {title}",
        },
    }


def generate_svg_diagram(
    filename: str,
    title: str,
    svg_content: str,
    diagram_type: str = "architecture",
) -> Dict[str, Any]:
    """Generates a scalable SVG vector diagram (architecture, sequence, flow chart) for the Workspace Canvas.

    Args:
        filename: Target filename ending in .svg (e.g. 'system_architecture.svg').
        title: Display title for the diagram (e.g. 'Serverless Pipeline Architecture').
        svg_content: Valid SVG markup with viewBox, shapes, text, and connector lines.
        diagram_type: Classification: 'architecture', 'sequence', 'flowchart', 'erd', or 'network'.

    Returns:
        Structured artifact payload for the Agent Runtime UI canvas.
    """
    clean_filename = filename if filename.endswith(".svg") else f"{filename}.svg"
    return {
        "status": "success",
        "artifact": {
            "filename": clean_filename,
            "title": title or clean_filename,
            "mimeType": "image/svg+xml",
            "content": svg_content,
            "diagramType": diagram_type,
        },
    }


def export_csv_dataset(
    filename: str,
    title: str,
    csv_content: str,
    delimiter: str = ",",
) -> Dict[str, Any]:
    """Generates a structured CSV/TSV dataset rendered as an interactive searchable and sortable table.

    Args:
        filename: Target filename ending in .csv or .tsv (e.g. 'cloud_costs_2026.csv').
        title: Display title for the dataset (e.g. 'Q1 Cloud Spend Analysis').
        csv_content: Comma-separated or tab-separated text with a header row.
        delimiter: Delimiter character (default: ',').

    Returns:
        Structured artifact payload for the Agent Runtime UI canvas.
    """
    clean_filename = (
        filename
        if (filename.endswith(".csv") or filename.endswith(".tsv"))
        else f"{filename}.csv"
    )
    mime_type = (
        "text/tab-separated-values"
        if clean_filename.endswith(".tsv")
        else "text/csv"
    )
    return {
        "status": "success",
        "artifact": {
            "filename": clean_filename,
            "title": title or clean_filename,
            "mimeType": mime_type,
            "content": csv_content,
            "delimiter": delimiter,
        },
    }


def create_code_artifact(
    filename: str,
    title: str,
    language: str,
    code: str,
) -> Dict[str, Any]:
    """Generates a syntax-highlighted code file or technical configuration for the Workspace Canvas.

    Args:
        filename: Target filename with appropriate extension (e.g. 'schema.sql', 'main.py', 'deploy.yaml').
        title: Display title for the code artifact.
        language: Programming or markup language (e.g. 'python', 'typescript', 'sql', 'yaml', 'json').
        code: Source code content.

    Returns:
        Structured artifact payload for the Agent Runtime UI canvas.
    """
    return {
        "status": "success",
        "artifact": {
            "filename": filename,
            "title": title or filename,
            "mimeType": f"text/x-{language}",
            "language": language,
            "content": code,
        },
    }
