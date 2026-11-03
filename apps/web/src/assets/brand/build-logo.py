import re, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.svgLib.path import parse_path

K = "/home/elmar/.claude/skills/holberton-az-slides/assets/kit"
out = sys.argv[1]
TEXT = sys.argv[2] if len(sys.argv) > 2 else "QUIZ"
LABEL = sys.argv[3] if len(sys.argv) > 3 else "Holberton Quiz"
SLUG = sys.argv[4] if len(sys.argv) > 4 else "holberton-quiz"
wm = open(f"{K}/logos/holberton-wordmark.svg").read()
d_wm = re.search(r' d="([^"]+)"', wm).group(1)

# Wordmark bounds (official vector, untouched).
bp = BoundsPen(None); parse_path(d_wm, bp); wx0, wy0, wx1, wy1 = bp.bounds
WH = wy1 - wy0                       # wordmark height (H top to baseline)
WW = wx1 - wx0

font = TTFont(f"{K}/fonts/HostGrotesk-normal-latin.woff2")
if "fvar" in font: font = instancer.instantiateVariableFont(font, {"wght": 650})
gs = font.getGlyphSet(); cmap = font.getBestCmap(); upm = font["head"].unitsPerEm
cap = font["OS/2"].sCapHeight or 700

def caps(text, cap_h, tracking_em, x, baseline):
    """Outline text at cap height cap_h; returns (path d, width)."""
    s = cap_h / cap
    pen = SVGPathPen(gs); cx = 0.0
    for i, ch in enumerate(text):
        g = cmap[ord(ch)]
        tp = TransformPen(pen, (s, 0, 0, -s, x + cx, baseline))
        gs[g].draw(tp)
        cx += gs[g].width * s + (tracking_em * cap_h / 0.7 if i < len(text) - 1 else 0)
    return pen.getCommands(), cx

def svg(view, paths, label):
    body = "".join(f'<path fill="currentColor" d="{p}"/>' for p in paths)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" aria-hidden="true" focusable="false">{body}</svg>\n'

# Stacked: proportions measured on the official HSAZ lockup (AZERBAIJAN cap height ≈ .364 H, gap ≈ .35 H).
ch = 0.364 * WH; gap = 0.35 * WH
qd, qw = caps(TEXT, ch, 0.13, 0, 0)
# Long subtitles (e.g. SELF-LEARNING HUB) shrink to at most 92% of the wordmark width, like a lockup.
if qw > 0.92 * WW:
    ch *= 0.92 * WW / qw
    qd, qw = caps(TEXT, ch, 0.13, 0, 0)
qx = wx0 + (WW - qw) / 2; base = wy1 + gap + ch
qd, _ = caps(TEXT, ch, 0.13, qx, base)
pad = WH * 0.08
open(f"{out}/{SLUG}-stacked.svg", "w").write(svg(f"{wx0-pad:.2f} {wy0-pad:.2f} {WW+2*pad:.2f} {base-wy0+2*pad:.2f}", [d_wm, qd], LABEL))

# Inline: wordmark │ QUIZ, caps half the H height, centred on it; hairline rule as tall as the H.
ch2 = 0.5 * WH; g2 = WH * 0.42; rule_w = max(WH * 0.045, 0.6)
rx = wx1 + g2
rule = f"M{rx:.2f},{wy0:.2f}h{rule_w:.2f}v{WH:.2f}h{-rule_w:.2f}z"
qx2 = rx + rule_w + g2; base2 = wy0 + (WH + ch2) / 2
qd2, qw2 = caps(TEXT, ch2, 0.12, qx2, base2)
open(f"{out}/{SLUG}-inline.svg", "w").write(svg(f"{wx0-pad:.2f} {wy0-pad:.2f} {qx2+qw2-wx0+2*pad:.2f} {WH+2*pad:.2f}", [d_wm, rule, qd2], LABEL))
print("WH", round(WH,2), "WW", round(WW,2), "cap", cap, "upm", upm)
