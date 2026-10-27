# Generates every Hypergen brand asset from scripts/brand/mark-source.png.
#   python scripts/brand/generate.py
# Needs Pillow, numpy and opencv-python.

import os
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
DESKTOP = os.path.join(ROOT, 'apps', 'desktop', 'assets')
PUBLIC = os.path.join(ROOT, 'apps', 'web', 'public')
ICONS = os.path.join(ROOT, 'apps', 'web', 'src', 'assets', 'icons')
IMAGES = os.path.join(ROOT, 'apps', 'web', 'src', 'assets', 'images')
FONT = os.path.join(ROOT, 'apps', 'web', 'src', 'assets', 'fonts', 'Inter-VariableFont_opsz,wght.ttf')

BLUE = (0, 102, 255)
WHITE = (255, 255, 255)
INK = (14, 16, 22)


def load_mask():
    gray = cv2.imread(os.path.join(os.path.dirname(__file__), 'mark-source.png'), cv2.IMREAD_GRAYSCALE)
    mask = (gray < 128).astype(np.uint8) * 255
    ys, xs = np.nonzero(mask)
    return mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


MASK = load_mask()


def mark(height, color, thicken=0):
    """The mark as an RGBA image `height` px tall. `thicken` widens strokes for tiny sizes."""
    m = MASK
    if thicken:
        k = np.ones((thicken, thicken), np.uint8)
        m = cv2.dilate(m, k)
    h, w = m.shape
    width = max(1, round(w * height / h))
    alpha = Image.fromarray(m).resize((width, height), Image.LANCZOS)
    img = Image.new('RGBA', (width, height), color + (0,))
    img.putalpha(alpha)
    return img


def rounded(size, radius, fill):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=fill)
    return img


def tile(size, mark_ratio=0.56, thicken=12, radius_ratio=0.225):
    """White rounded square with the blue mark centred."""
    img = rounded(size, round(size * radius_ratio), WHITE + (255,))
    m = mark(max(1, round(size * mark_ratio)), BLUE, thicken)
    img.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return img


def small_thicken(size):
    # strokes are ~1.2% of the mark height; keep them >= ~1px at small sizes
    return 12 if size >= 64 else (36 if size <= 20 else 24)


def macos_icon():
    # Apple grid: 824px body inside a 1024 canvas, with a soft drop shadow.
    canvas = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    shadow = rounded(824, 185, (0, 0, 0, 70)).resize((824, 824))
    canvas.alpha_composite(shadow, (100, 112))
    canvas = Image.fromarray(cv2.GaussianBlur(np.array(canvas), (0, 0), 12))
    canvas.alpha_composite(tile(824), (100, 100))
    return canvas


def text(draw, xy, s, size, fill, weight=600, anchor='la'):
    font = ImageFont.truetype(FONT, size)
    try:
        font.set_variation_by_axes([14, weight])
    except Exception:
        pass
    draw.text(xy, s, font=font, fill=fill, anchor=anchor)


def trace_svg_path(scale_to, offset):
    """Vector path of the mark (even-odd), scaled so its height == scale_to."""
    contours, _ = cv2.findContours(MASK, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    s = scale_to / MASK.shape[0]
    ox, oy = offset
    parts = []
    for c in contours:
        c = cv2.approxPolyDP(c, 1.2, True)
        pts = [(ox + p[0][0] * s, oy + p[0][1] * s) for p in c]
        if len(pts) < 3:
            continue
        parts.append('M' + ' L'.join(f'{x:.2f} {y:.2f}' for x, y in pts) + 'Z')
    return ' '.join(parts)


def svg_logo(view, height):
    w = MASK.shape[1] * height / MASK.shape[0]
    d = trace_svg_path(height, ((view - w) / 2, (view - height) / 2))
    return (f'<svg viewBox="0 0 {view} {view}" fill="none" xmlns="http://www.w3.org/2000/svg">\n'
            f'<path fill-rule="evenodd" clip-rule="evenodd" d="{d}" fill="currentColor"/>\n</svg>\n')


def write(path, content):
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)


def main():
    # --- desktop app icons ---------------------------------------------------
    macos_icon().save(os.path.join(DESKTOP, 'icon.png'))
    tile(1024).save(os.path.join(DESKTOP, 'icon-win.png'))
    dev = macos_icon()
    d = ImageDraw.Draw(dev)
    d.rounded_rectangle((640, 760, 900, 870), radius=40, fill=(255, 149, 0, 255))
    text(d, (770, 815), 'DEV', 72, WHITE, 800, 'mm')
    dev.save(os.path.join(DESKTOP, 'icon-dev.png'))

    ico_sizes = [256, 128, 96, 64, 48, 40, 32, 24, 20, 16]
    frames = [tile(s, 0.62 if s < 64 else 0.56, small_thicken(s)) for s in ico_sizes]
    frames[0].save(os.path.join(DESKTOP, 'icon.ico'), sizes=[(s, s) for s in ico_sizes], append_images=frames[1:])
    macos_icon().save(os.path.join(DESKTOP, 'icon.icns'))

    # --- tray (macOS template = black + alpha; Windows = brand tile) ---------
    tray = os.path.join(DESKTOP, 'tray')
    for scale, suffix in ((1, ''), (2, '@2x')):
        px = 18 * scale
        idle = Image.new('RGBA', (px, px), (0, 0, 0, 0))
        m = mark(round(px * 0.9), (0, 0, 0), 30 if scale == 1 else 20)
        idle.alpha_composite(m, ((px - m.width) // 2, (px - m.height) // 2))
        idle.save(os.path.join(tray, f'idleTemplate{suffix}.png'))
        busy = idle.copy()
        r = 2.5 * scale
        ImageDraw.Draw(busy).ellipse((px - 2 * r - 0.5, 0.5, px - 0.5, 2 * r + 0.5), fill=(0, 0, 0, 255))
        busy.save(os.path.join(tray, f'busyTemplate{suffix}.png'))
        tile(16 * scale, 0.66, small_thicken(16 * scale)).save(os.path.join(tray, f'win{suffix}.png'))

    # --- DMG background (658x498 window) -------------------------------------
    for scale, suffix in ((1, ''), (2, '@2x')):
        w, h = 658 * scale, 498 * scale
        bg = Image.new('RGBA', (w, h), (247, 249, 252, 255))
        d = ImageDraw.Draw(bg)
        for i, a in enumerate((60, 100, 140, 190, 240)):
            x = (272 + i * 22) * scale
            y = 218 * scale
            d.line([(x, y - 9 * scale), (x + 8 * scale, y), (x, y + 9 * scale)], fill=BLUE + (a,), width=2 * scale)
        text(d, (w // 2, 400 * scale), 'Drag Hypergen to Applications', 15 * scale, (90, 98, 112), 500, 'mm')
        bg.save(os.path.join(DESKTOP, f'dmg-background{suffix}.png'))

    # --- Squirrel install spinner (440x280, animated) ------------------------
    frames = []
    for i in range(30):
        f = Image.new('RGBA', (440, 280), WHITE + (255,))
        f.alpha_composite(tile(96), (172, 56))
        d = ImageDraw.Draw(f)
        text(d, (220, 186), 'Installing Hypergen', 16, (60, 66, 78), 500, 'mm')
        d.rounded_rectangle((140, 214, 300, 218), radius=2, fill=(228, 232, 240, 255))
        x = 140 + (i / 29) * 120
        d.rounded_rectangle((x, 214, x + 40, 218), radius=2, fill=BLUE + (255,))
        frames.append(f.convert('RGB').convert('P', palette=Image.ADAPTIVE, colors=64))
    frames[0].save(os.path.join(DESKTOP, 'install-spinner.gif'), save_all=True, append_images=frames[1:], duration=50, loop=0)

    # --- web ----------------------------------------------------------------
    path120 = trace_svg_path(66, ((120 - MASK.shape[1] * 66 / MASK.shape[0]) / 2, 27))
    write(os.path.join(PUBLIC, 'mark.svg'),
          '<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">\n'
          '<rect width="120" height="120" rx="27" fill="#FFFFFF"/>\n'
          f'<path fill-rule="evenodd" clip-rule="evenodd" d="{path120}" fill="#0066FF"/>\n</svg>\n')
    tile(80).save(os.path.join(PUBLIC, 'mark-large.png'))
    macos_icon().resize((128, 128), Image.LANCZOS).save(os.path.join(PUBLIC, 'mark-macos-small.png'))

    og = Image.new('RGBA', (1200, 630), (10, 12, 18, 255))
    glow = Image.new('RGBA', (1200, 630), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((250, -150, 950, 550), fill=(0, 102, 255, 90))
    og.alpha_composite(Image.fromarray(cv2.GaussianBlur(np.array(glow), (0, 0), 120)))
    og.alpha_composite(tile(150), (225, 240))
    d = ImageDraw.Draw(og)
    text(d, (410, 315), 'Hypergen', 110, WHITE, 650, 'lm')
    text(d, (414, 410), 'The AI video editor built for agents.', 30, (170, 180, 198), 450, 'lm')
    og.convert('RGB').save(os.path.join(PUBLIC, 'og-default.png'))

    banner = Image.new('RGBA', (440, 330), (8, 10, 16, 255))
    glow = Image.new('RGBA', (440, 330), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((60, 120, 380, 420), fill=(0, 102, 255, 110))
    banner.alpha_composite(Image.fromarray(cv2.GaussianBlur(np.array(glow), (0, 0), 60)))
    ImageDraw.Draw(banner).rounded_rectangle((40, 134, 400, 196), radius=18, fill=(255, 255, 255, 28))
    for i, x in enumerate((60, 108, 156, 252, 300, 348)):
        ImageDraw.Draw(banner).rounded_rectangle((x, 145, x + 40, 185), radius=10, fill=(255, 255, 255, 40 + i * 6))
    banner.alpha_composite(tile(64), (188, 133))
    banner.save(os.path.join(IMAGES, 'desktop-app-banner.png'))

    # --- repository banner (README) -------------------------------------------
    gb = Image.new('RGBA', (1600, 520), (8, 10, 16, 255))
    glow = Image.new('RGBA', (1600, 520), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((300, -260, 1300, 560), fill=(0, 102, 255, 95))
    gb.alpha_composite(Image.fromarray(cv2.GaussianBlur(np.array(glow), (0, 0), 140)))
    gb.alpha_composite(tile(170), (430, 175))
    d = ImageDraw.Draw(gb)
    text(d, (640, 255), 'Hypergen', 128, WHITE, 650, 'lm')
    text(d, (646, 360), 'The AI video editor built for agents', 34, (170, 180, 198), 450, 'lm')
    gb.convert('RGB').save(os.path.join(ROOT, 'assets', 'banner.png'))

    write(os.path.join(ICONS, 'hypergen-logo.svg'), svg_logo(25, 15))
    write(os.path.join(ICONS, 'hypergen-logo-large.svg'), svg_logo(25, 20))
    print('splash path (64 view, 44 tall):')
    print(trace_svg_path(44, ((64 - MASK.shape[1] * 44 / MASK.shape[0]) / 2, 10)))


if __name__ == '__main__':
    main()
