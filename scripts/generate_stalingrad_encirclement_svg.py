from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape


WIDTH = 1600
HEIGHT = 1000

BG = "#f6f1e8"
GRID = "#e9e1d3"
STEPPE = "#eadfca"
VOLGA_BAND = "#e7dcc4"
POCKET = "#e6b6ae"
RIVER = "#4d89c7"
AXIS = "#bb4f3f"
SOVIET = "#2f7d59"
TEXT = "#2a241d"
MUTED = "#6c6258"
CITY = "#1f1c18"
LINKUP = "#8a5a2b"


def svg_text(
    x: int,
    y: int,
    text: str,
    size: int,
    weight: str = "400",
    fill: str = TEXT,
    anchor: str = "start",
) -> str:
    return (
        f'<text x="{x}" y="{y}" font-family="DejaVu Sans, Arial, sans-serif" '
        f'font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">{escape(text)}</text>'
    )


def svg_multiline_text(
    x: int,
    y: int,
    lines: list[str],
    size: int,
    fill: str = TEXT,
    weight: str = "400",
    line_gap: int = 28,
) -> str:
    spans = []
    for idx, line in enumerate(lines):
        dy = 0 if idx == 0 else line_gap
        spans.append(f'<tspan x="{x}" dy="{dy}">{escape(line)}</tspan>')
    return (
        f'<text x="{x}" y="{y}" font-family="DejaVu Sans, Arial, sans-serif" '
        f'font-size="{size}" font-weight="{weight}" fill="{fill}">{"".join(spans)}</text>'
    )


def arrow(points: list[tuple[int, int]], color: str, width: int = 12) -> str:
    point_str = " ".join(f"{x},{y}" for x, y in points)
    (x1, y1), (x2, y2) = points[-2], points[-1]
    dx = x2 - x1
    dy = y2 - y1
    mag = (dx * dx + dy * dy) ** 0.5 or 1
    ux = dx / mag
    uy = dy / mag
    px = -uy
    py = ux
    head = 28
    wing = 14
    left = (int(x2 - ux * head + px * wing), int(y2 - uy * head + py * wing))
    right = (int(x2 - ux * head - px * wing), int(y2 - uy * head - py * wing))
    head_points = f"{x2},{y2} {left[0]},{left[1]} {right[0]},{right[1]}"
    return (
        f'<polyline points="{point_str}" fill="none" stroke="{color}" stroke-width="{width}" '
        'stroke-linecap="round" stroke-linejoin="round"/>'
        f'<polygon points="{head_points}" fill="{color}"/>'
    )


def city(x: int, y: int, name: str, label_x: int, label_y: int) -> str:
    return (
        f'<circle cx="{x}" cy="{y}" r="7" fill="{CITY}"/>'
        + svg_text(label_x, label_y, name, 24, "700")
    )


def main() -> None:
    grid_lines = []
    for x in range(0, WIDTH, 80):
        grid_lines.append(f'<line x1="{x}" y1="0" x2="{x}" y2="{HEIGHT}" stroke="{GRID}" stroke-width="1"/>')
    for y in range(0, HEIGHT, 80):
        grid_lines.append(f'<line x1="0" y1="{y}" x2="{WIDTH}" y2="{y}" stroke="{GRID}" stroke-width="1"/>')

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}">
  <rect width="100%" height="100%" fill="{BG}"/>
  {''.join(grid_lines)}

  <polygon points="120,180 1000,150 1225,245 1240,650 1030,825 250,835 90,610" fill="{STEPPE}"/>
  <polygon points="1010,180 1190,205 1215,790 1040,790" fill="{VOLGA_BAND}"/>
  <polygon points="820,365 970,365 1080,430 1095,575 1005,675 840,690 720,610 710,470" fill="{POCKET}" opacity="0.75"/>

  <polyline points="1090,150 1110,250 1125,365 1140,495 1160,640 1180,845" fill="none" stroke="{RIVER}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="430,185 520,265 665,350 805,420 885,470 845,560 740,650 640,790" fill="none" stroke="{RIVER}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  <ellipse cx="840" cy="505" rx="170" ry="145" fill="none" stroke="#7aa9d9" stroke-width="5"/>

  {svg_text(80, 88, "Stalingrad Encirclement Map", 42, "700")}
  {svg_text(80, 126, "Operation Uranus: the Soviet pincer closed west of Stalingrad and trapped the German Sixth Army", 22, "400", MUTED)}

  {svg_text(280, 270, "DON BEND", 28, "700", MUTED)}
  {svg_text(1030, 700, "VOLGA", 30, "700", "#8d7a60")}
  {svg_text(775, 550, "TRAPPED POCKET", 28, "700", AXIS)}
  {svg_text(78, 940, "Not to scale. Built as a story-oriented encirclement explainer.", 17, "400", MUTED)}

  <rect x="980" y="335" width="180" height="38" rx="8" fill="#edf5ff"/>{svg_text(990, 361, "Volga River", 20, "400", RIVER)}
  <rect x="510" y="300" width="165" height="38" rx="8" fill="#edf5ff"/>{svg_text(520, 326, "Don River", 20, "400", RIVER)}

  {city(1098, 505, "Stalingrad", 1116, 497)}
  {city(820, 498, "Kalach", 838, 490)}
  {city(900, 235, "Serafimovich", 918, 226)}
  {city(690, 735, "Kotelnikovo", 708, 727)}

  {arrow([(285, 315), (470, 330), (660, 370), (855, 435)], AXIS, 14)}
  {svg_text(305, 355, "German line on the Don and thrust toward Stalingrad", 20, "400", AXIS)}

  {arrow([(585, 255), (665, 320), (740, 390), (815, 470)], SOVIET, 12)}
  {arrow([(560, 760), (655, 690), (735, 620), (815, 555)], SOVIET, 12)}
  {svg_text(300, 450, "Northern Soviet strike", 20, "400", SOVIET)}
  {svg_text(340, 705, "Southern Soviet strike", 20, "400", SOVIET)}

  {arrow([(840, 470), (810, 485), (790, 500), (770, 510)], LINKUP, 10)}
  {svg_text(655, 470, "Link-up near Kalach closes the ring", 20, "400", LINKUP)}

  <line x1="770" y1="510" x2="1030" y2="520" stroke="{AXIS}" stroke-width="4" stroke-dasharray="10 10"/>
  {svg_text(810, 545, "Supply line cut", 18, "400", AXIS)}

  {svg_text(620, 250, "Romanian Third Army flank", 18, "400", MUTED)}
  {svg_text(530, 820, "Romanian Fourth Army flank", 18, "400", MUTED)}

  <rect x="1185" y="215" width="330" height="290" rx="22" fill="#fff9ef" stroke="#d9cdbd" stroke-width="2"/>
  {svg_text(1215, 250, "Why the encirclement worked", 26, "700")}
  <circle cx="1222" cy="292" r="5" fill="{MUTED}"/>
  {svg_multiline_text(1243, 299, ["The German push toward the Volga", "left weaker allied units holding", "long flanks on the Don."], 20)}
  <circle cx="1222" cy="382" r="5" fill="{MUTED}"/>
  {svg_multiline_text(1243, 389, ["The Soviet attack hit from north", "and south rather than straight at", "the city center."], 20)}
  <circle cx="1222" cy="472" r="5" fill="{MUTED}"/>
  {svg_multiline_text(1243, 479, ["Once the pincers met near Kalach,", "the Sixth Army was trapped in the", "Stalingrad pocket."], 20)}

  <rect x="76" y="835" width="560" height="108" rx="18" fill="#fff9ef" stroke="#d9cdbd" stroke-width="2"/>
  <line x1="104" y1="875" x2="170" y2="875" stroke="{RIVER}" stroke-width="12"/>{svg_text(190, 882, "Major rivers", 20)}
  <line x1="104" y1="907" x2="170" y2="907" stroke="{AXIS}" stroke-width="12"/><polygon points="170,907 150,895 150,919" fill="{AXIS}"/>{svg_text(190, 914, "Axis line / drive", 20)}
  <line x1="350" y1="907" x2="416" y2="907" stroke="{SOVIET}" stroke-width="12"/><polygon points="416,907 396,895 396,919" fill="{SOVIET}"/>{svg_text(436, 914, "Soviet pincer", 20)}
</svg>
"""

    out_dir = Path("/home/boovius/.openclaw/workspace/tmp")
    out_dir.mkdir(parents=True, exist_ok=True)
    svg_path = out_dir / "stalingrad-encirclement-map.svg"
    svg_path.write_text(svg, encoding="utf-8")
    print(svg_path)


if __name__ == "__main__":
    main()
