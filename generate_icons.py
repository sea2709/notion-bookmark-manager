#!/usr/bin/env python3
"""Generate bookmark-shaped icons with an 'N' letter for the Notion Bookmark Manager extension."""

from PIL import Image, ImageDraw, ImageFont
import os

SIZES = [16, 32, 48, 128]

# Colors
BG_COLOR = (0, 0, 0, 0)          # Transparent background
BOOKMARK_COLOR = (37, 99, 235)    # Blue bookmark body
BOOKMARK_SHADOW = (29, 78, 216)   # Slightly darker for notch
LETTER_COLOR = (255, 255, 255)    # White "N"


def draw_bookmark_icon(size):
    img = Image.new("RGBA", (size, size), BG_COLOR)
    draw = ImageDraw.Draw(img)

    # Bookmark shape proportions
    pad = max(1, size // 10)
    left = pad
    right = size - pad
    top = pad
    bottom = size - pad

    width = right - left
    height = bottom - top

    # The notch depth (the V cut at the bottom)
    notch_depth = height * 0.22
    notch_mid_x = left + width // 2

    # Draw bookmark polygon (rectangle with V notch at bottom)
    points = [
        (left, top),
        (right, top),
        (right, bottom),
        (notch_mid_x, bottom - notch_depth),
        (left, bottom),
    ]
    draw.polygon(points, fill=BOOKMARK_COLOR)

    # Draw a subtle inner shadow on the notch edges
    notch_line_width = max(1, size // 32)
    draw.line(
        [(right, bottom), (notch_mid_x, bottom - notch_depth)],
        fill=BOOKMARK_SHADOW,
        width=notch_line_width,
    )
    draw.line(
        [(left, bottom), (notch_mid_x, bottom - notch_depth)],
        fill=BOOKMARK_SHADOW,
        width=notch_line_width,
    )

    # Draw "N" in the center
    # Center is slightly above mid due to notch
    cx = left + width // 2
    cy = top + int(height * 0.42)

    font_size = max(6, int(height * 0.52))

    font = None
    font_paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial Bold.ttf",
    ]
    for fp in font_paths:
        if os.path.exists(fp):
            try:
                font = ImageFont.truetype(fp, font_size)
                break
            except Exception:
                continue

    if font is None:
        # Fall back to default bitmap font
        font = ImageFont.load_default()

    # Measure text
    bbox = draw.textbbox((0, 0), "N", font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = cx - tw // 2 - bbox[0]
    ty = cy - th // 2 - bbox[1]

    draw.text((tx, ty), "N", font=font, fill=LETTER_COLOR)

    return img


def main():
    os.makedirs("icons", exist_ok=True)
    for size in SIZES:
        img = draw_bookmark_icon(size)
        path = f"icons/icon{size}.png"
        img.save(path)
        print(f"Generated {path} ({size}x{size})")
    print("Done.")


if __name__ == "__main__":
    main()
