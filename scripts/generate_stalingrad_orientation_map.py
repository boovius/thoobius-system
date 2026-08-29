from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape
from PIL import Image, ImageDraw, ImageFont


WIDTH = 1600
HEIGHT = 1000

BG = "#f6f1e8"
STEPPE = "#eadfca"
CAUCASUS = "#d9c6a3"
RIVER = "#4d89c7"
AXIS = "#bb4f3f"
SOVIET = "#2f7d59"
TEXT = "#2a241d"
MUTED = "#6c6258"
CITY = "#1f1c18"
GRID = "#e9e1d3"


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = []
    if bold:
        candidates.extend(
            [
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
            ]
        )
    else:
        candidates.extend(
            [
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                "/usr/share/fonts/dejavu/DejaVuSans.ttf",
            ]
        )
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


TITLE = load_font(42, bold=True)
SUBTITLE = load_font(22)
LABEL = load_font(24, bold=True)
BODY = load_font(20)
SMALL = load_font(17)


def draw_arrow(draw: ImageDraw.ImageDraw, points: list[tuple[int, int]], color: str, width: int = 12) -> None:
    draw.line(points, fill=color, width=width, joint="curve")
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
    tip = (x2, y2)
    left = (int(x2 - ux * head + px * wing), int(y2 - uy * head + py * wing))
    right = (int(x2 - ux * head - px * wing), int(y2 - uy * head - py * wing))
    draw.polygon([tip, left, right], fill=color)


def text_box(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, font, fill=TEXT, anchor="la") -> None:
    draw.text(xy, text, font=font, fill=fill, anchor=anchor)


def river_label(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str) -> None:
    x, y = xy
    draw.rounded_rectangle((x - 8, y - 8, x + 170, y + 26), radius=8, fill="#edf5ff")
    draw.text((x, y), text, font=BODY, fill=RIVER)


def city(draw: ImageDraw.ImageDraw, xy: tuple[int, int], name: str, offset: tuple[int, int] = (12, -10)) -> None:
    x, y = xy
    draw.ellipse((x - 7, y - 7, x + 7, y + 7), fill=CITY)
    draw.text((x + offset[0], y + offset[1]), name, font=LABEL, fill=TEXT)


def main() -> None:
    image = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(image)

    # Subtle paper grid.
    for x in range(0, WIDTH, 80):
        draw.line([(x, 0), (x, HEIGHT)], fill=GRID, width=1)
    for y in range(0, HEIGHT, 80):
        draw.line([(0, y), (WIDTH, y)], fill=GRID, width=1)

    # Steppe field.
    draw.polygon(
        [
            (120, 180),
            (1010, 135),
            (1230, 280),
            (1170, 695),
            (910, 850),
            (250, 820),
            (90, 615),
        ],
        fill=STEPPE,
    )

    # Lower Volga corridor tint.
    draw.polygon(
        [
            (1035, 170),
            (1205, 200),
            (1245, 780),
            (1065, 760),
        ],
        fill="#e7dcc4",
    )

    # Caucasus massif.
    draw.polygon(
        [
            (1015, 760),
            (1225, 665),
            (1450, 735),
            (1510, 910),
            (1060, 940),
        ],
        fill=CAUCASUS,
    )

    # Small Caspian hint to orient the southeast edge.
    draw.polygon(
        [
            (1465, 640),
            (1575, 705),
            (1595, 930),
            (1510, 965),
            (1455, 860),
        ],
        fill="#d7e8f7",
    )

    # Volga and Don river system.
    volga = [(1085, 150), (1105, 255), (1120, 360), (1140, 470), (1160, 615), (1185, 825)]
    don = [(440, 145), (495, 255), (620, 350), (770, 400), (860, 465), (810, 560), (690, 650), (605, 785)]
    draw.line(volga, fill=RIVER, width=18, joint="curve")
    draw.line(don, fill=RIVER, width=18, joint="curve")

    # Secondary river hint flowing into the Don system.
    draw.line([(560, 245), (640, 250), (720, 270)], fill="#7aa9d9", width=8, joint="curve")

    # Don bend highlight.
    draw.ellipse((680, 340, 940, 600), outline="#7aa9d9", width=5)

    # Title and framing.
    text_box(draw, (80, 52), "Stalingrad Orientation Map", TITLE)
    text_box(
        draw,
        (80, 104),
        "A simplified campaign view: geography, direction of attack, and the trap around Stalingrad",
        SUBTITLE,
        fill=MUTED,
    )

    # Region labels.
    text_box(draw, (265, 255), "UKRAINE / SOUTHERN RUSSIA", LABEL, fill=MUTED)
    text_box(draw, (590, 515), "DON BEND", LABEL, fill=MUTED)
    text_box(draw, (290, 705), "STEPPE", TITLE, fill="#b59363")
    text_box(draw, (1175, 835), "CAUCASUS", TITLE, fill="#8a6532")
    text_box(draw, (1245, 885), "Oil objective", SUBTITLE, fill="#8a6532")
    text_box(draw, (1470, 815), "CASPIAN\nSEA", LABEL, fill="#5a84aa")
    text_box(draw, (1010, 640), "LOWER VOLGA", LABEL, fill="#8d7a60")
    text_box(draw, (78, 930), "Not to scale. Built as a reading-orientation graphic, not a battlefield atlas.", SMALL, fill=MUTED)

    river_label(draw, (1000, 335), "Volga River")
    river_label(draw, (520, 290), "Don River")

    # Cities.
    city(draw, (1098, 505), "Stalingrad", offset=(18, -8))
    city(draw, (820, 500), "Kalach", offset=(18, -10))
    city(draw, (890, 235), "Voronezh", offset=(18, -12))
    city(draw, (675, 735), "Rostov-on-Don", offset=(18, -12))
    city(draw, (1240, 735), "Caucasus gateway", offset=(18, -12))

    # Frontline story arrows.
    draw_arrow(draw, [(270, 285), (470, 295), (650, 325), (835, 390), (1015, 455)], AXIS, width=14)
    draw_arrow(draw, [(760, 792), (900, 770), (1060, 765), (1235, 775)], AXIS, width=14)
    text_box(draw, (300, 332), "German summer push toward the Volga", BODY, fill=AXIS)
    text_box(draw, (855, 828), "German drive toward the Caucasus", BODY, fill=AXIS)

    draw_arrow(draw, [(585, 318), (660, 390), (725, 470), (775, 535)], SOVIET, width=12)
    draw_arrow(draw, [(540, 742), (640, 680), (720, 620), (790, 566)], SOVIET, width=12)
    text_box(draw, (340, 445), "Soviet encirclement from the north and south", BODY, fill=SOVIET)

    # Stalingrad focus box.
    draw.rounded_rectangle((1185, 210, 1525, 495), radius=24, fill="#fff9ef", outline="#d9cdbd", width=2)
    text_box(draw, (1215, 238), "Why this geography mattered", LABEL)
    bullet_y = 284
    bullets = [
        "Stalingrad sat on the Volga,\nso the city could still be fed\nfrom the east bank.",
        "The Don bend left weaker Axis\nallies exposed on the flanks.",
        "Trying to reach both the Volga\nand the Caucasus stretched\nGerman forces too thin.",
    ]
    for bullet in bullets:
        draw.ellipse((1217, bullet_y + 8, 1227, bullet_y + 18), fill=MUTED)
        draw.multiline_text((1243, bullet_y), bullet, font=BODY, fill=TEXT, spacing=4)
        bullet_y += 78

    # Legend.
    draw.rounded_rectangle((76, 840, 530, 940), radius=18, fill="#fff9ef", outline="#d9cdbd", width=2)
    draw.line([(104, 878), (170, 878)], fill=RIVER, width=12)
    draw.text((190, 865), "Major rivers", font=BODY, fill=TEXT)
    draw.line([(104, 905), (170, 905)], fill=AXIS, width=12)
    draw.polygon([(170, 905), (150, 893), (150, 917)], fill=AXIS)
    draw.text((190, 892), "German advance", font=BODY, fill=TEXT)
    draw.line([(335, 905), (401, 905)], fill=SOVIET, width=12)
    draw.polygon([(401, 905), (381, 893), (381, 917)], fill=SOVIET)
    draw.text((420, 892), "Soviet counterstroke", font=BODY, fill=TEXT)

    out_dir = Path("/home/boovius/.openclaw/workspace/tmp")
    out_dir.mkdir(parents=True, exist_ok=True)
    png_path = out_dir / "stalingrad-orientation-map.png"
    svg_path = out_dir / "stalingrad-orientation-map.svg"
    image.save(png_path)
    svg_path.write_text(build_svg(), encoding="utf-8")
    print(png_path)
    print(svg_path)


def svg_text(x: int, y: int, text: str, size: int, weight: str = "400", fill: str = TEXT, anchor: str = "start") -> str:
    return (
        f'<text x="{x}" y="{y}" font-family="DejaVu Sans, Arial, sans-serif" '
        f'font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">{escape(text)}</text>'
    )


def svg_multiline_text(x: int, y: int, lines: list[str], size: int, fill: str = TEXT, weight: str = "400", line_gap: int = 28) -> str:
    spans = []
    for idx, line in enumerate(lines):
        dy = 0 if idx == 0 else line_gap
        spans.append(f'<tspan x="{x}" dy="{dy}">{escape(line)}</tspan>')
    return (
        f'<text x="{x}" y="{y}" font-family="DejaVu Sans, Arial, sans-serif" '
        f'font-size="{size}" font-weight="{weight}" fill="{fill}">{"".join(spans)}</text>'
    )


def build_svg() -> str:
    grid_lines = []
    for x in range(0, WIDTH, 80):
        grid_lines.append(f'<line x1="{x}" y1="0" x2="{x}" y2="{HEIGHT}" stroke="{GRID}" stroke-width="1"/>')
    for y in range(0, HEIGHT, 80):
        grid_lines.append(f'<line x1="0" y1="{y}" x2="{WIDTH}" y2="{y}" stroke="{GRID}" stroke-width="1"/>')

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}">
  <rect width="100%" height="100%" fill="{BG}"/>
  {''.join(grid_lines)}
  <polygon points="120,180 1010,135 1230,280 1170,695 910,850 250,820 90,615" fill="{STEPPE}"/>
  <polygon points="1015,760 1225,665 1450,735 1510,910 1060,940" fill="{CAUCASUS}"/>
  <polyline points="1085,150 1105,255 1120,360 1140,470 1160,615 1185,825" fill="none" stroke="{RIVER}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="440,145 495,255 620,350 770,400 860,465 810,560 690,650 605,785" fill="none" stroke="{RIVER}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  <ellipse cx="810" cy="470" rx="130" ry="128" fill="none" stroke="#7aa9d9" stroke-width="5"/>
  {svg_text(80, 88, "Stalingrad Orientation Map", 42, "700")}
  {svg_text(80, 126, "A simplified campaign view: geography, direction of attack, and the trap around Stalingrad", 22, "400", MUTED)}
  {svg_text(265, 276, "UKRAINE / SOUTHERN RUSSIA", 24, "700", MUTED)}
  {svg_text(590, 536, "DON BEND", 24, "700", MUTED)}
  {svg_text(290, 744, "STEPPE", 44, "700", "#b59363")}
  {svg_text(1175, 874, "CAUCASUS", 44, "700", "#8a6532")}
  {svg_text(1245, 906, "Oil objective", 22, "400", "#8a6532")}
  <rect x="992" y="327" width="178" height="38" rx="8" fill="#edf5ff"/>{svg_text(1000, 353, "Volga River", 20, "400", RIVER)}
  <rect x="512" y="282" width="178" height="38" rx="8" fill="#edf5ff"/>{svg_text(520, 308, "Don River", 20, "400", RIVER)}
  <circle cx="1098" cy="505" r="7" fill="{CITY}"/>{svg_text(1116, 497, "Stalingrad", 24, "700")}
  <circle cx="820" cy="500" r="7" fill="{CITY}"/>{svg_text(838, 490, "Kalach", 24, "700")}
  <circle cx="890" cy="235" r="7" fill="{CITY}"/>{svg_text(908, 243, "Voronezh", 24, "700")}
  <circle cx="675" cy="735" r="7" fill="{CITY}"/>{svg_text(693, 745, "Rostov-on-Don", 24, "700")}
  <circle cx="1240" cy="735" r="7" fill="{CITY}"/>{svg_text(1258, 745, "Caucasus gateway", 24, "700")}
  <polyline points="285,305 530,340 770,390 1000,470" fill="none" stroke="{AXIS}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
  <polygon points="1000,470 972,456 978,484" fill="{AXIS}"/>
  <polyline points="720,785 835,755 995,760 1215,760" fill="none" stroke="{AXIS}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
  <polygon points="1215,760 1187,746 1193,774" fill="{AXIS}"/>
  {svg_text(400, 378, "German summer push toward the Volga", 20, "400", AXIS)}
  {svg_text(840, 818, "German drive toward the Caucasus", 20, "400", AXIS)}
  <polyline points="640,330 720,410 785,520" fill="none" stroke="{SOVIET}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
  <polygon points="785,520 759,507 766,533" fill="{SOVIET}"/>
  <polyline points="620,710 720,640 790,575" fill="none" stroke="{SOVIET}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
  <polygon points="790,575 764,588 783,601" fill="{SOVIET}"/>
  {svg_text(430, 449, "Soviet encirclement from the flanks", 20, "400", SOVIET)}
  <rect x="1185" y="210" width="340" height="285" rx="24" fill="#fff9ef" stroke="#d9cdbd" stroke-width="2"/>
  {svg_text(1215, 260, "Why this geography mattered", 26, "700")}
  <circle cx="1222" cy="297" r="5" fill="{MUTED}"/>
  {svg_multiline_text(1243, 304, ["Stalingrad sat on the Volga,", "so the city could still be fed", "from the east bank."], 20)}
  <circle cx="1222" cy="375" r="5" fill="{MUTED}"/>
  {svg_multiline_text(1243, 382, ["The Don bend left weaker Axis", "allies exposed on the flanks."], 20)}
  <circle cx="1222" cy="453" r="5" fill="{MUTED}"/>
  {svg_multiline_text(1243, 460, ["Trying to reach both the Volga", "and the Caucasus stretched", "German forces too thin."], 20)}
  <rect x="76" y="840" width="454" height="100" rx="18" fill="#fff9ef" stroke="#d9cdbd" stroke-width="2"/>
  <line x1="104" y1="878" x2="170" y2="878" stroke="{RIVER}" stroke-width="12"/>{svg_text(190, 885, "Major rivers", 20)}
  <line x1="104" y1="905" x2="170" y2="905" stroke="{AXIS}" stroke-width="12"/><polygon points="170,905 150,893 150,917" fill="{AXIS}"/>{svg_text(190, 912, "German advance", 20)}
  <line x1="335" y1="905" x2="401" y2="905" stroke="{SOVIET}" stroke-width="12"/><polygon points="401,905 381,893 381,917" fill="{SOVIET}"/>{svg_text(420, 912, "Soviet counterstroke", 20)}
</svg>
"""


if __name__ == "__main__":
    main()
