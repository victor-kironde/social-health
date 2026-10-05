"""
Draws simple illustrated avatars for the synthetic "Lives" scenarios (no real people, no external
service) and writes them as a TypeScript module of base64 JPEGs:

    python3 scripts/make-scenario-avatars.py

Each person gets a fixed look (age, hair, skin, clothes) so screenshots are reproducible; groups get
a symbol; each scenario's "You" gets an outfit that fits the story.
"""
import base64
import io
import json
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'apps/mobile/src/data/scenarioAvatars.ts'
S = 320  # drawing size (supersampled)


def font(size: int):
    try:
        return ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', size)
    except OSError:
        return ImageFont.load_default()

FINAL = 160

SKIN = ['#f3d2b3', '#e8b98f', '#c98e62', '#a86b45', '#7a4a2c', '#5a3520']
HAIR = {'black': '#1f1a17', 'brown': '#5b3a24', 'auburn': '#8a3b1f', 'blonde': '#d9b56b', 'grey': '#b9b6b0', 'white': '#e8e6e1'}
BG = ['#b9c6ec', '#a9d6e8', '#c9b8e6', '#e6c9b8', '#b8e0cf', '#e8d3a8', '#d6b8cf', '#c1c9d6']
SHIRT = ['#3f6fb5', '#2f8f83', '#8a4fa3', '#c0563f', '#5b7a3a', '#c79a2e', '#4a4f5c', '#b04a6e', '#2e6b8f']

# Per scenario: person id -> (age, hair style, hair colour, skin index, extras)
# age: kid | teen | adult | older ; style: short | long | bun | curly | bald | crop | ponytail
# extras: beard, glasses, scrubs, suit, apron, hoodie, collar
PEOPLE = {
    'doctor': {
        '__me__': ('adult', 'crop', 'black', 4, ['scrubs']),
        'grace': ('older', 'bun', 'grey', 1, ['glasses']),
        'tom': ('adult', 'short', 'brown', 0, []),
        'edwin': ('older', 'bald', 'white', 3, ['beard']),
        'amara': ('adult', 'curly', 'black', 5, ['scrubs']),
        'patel': ('adult', 'short', 'black', 3, ['glasses', 'collar']),
        'sam': ('adult', 'short', 'auburn', 1, ['beard']),
        'mum': ('older', 'bun', 'grey', 4, []),
        'jo': ('adult', 'ponytail', 'blonde', 0, []),
        'raj': ('adult', 'crop', 'black', 3, []),
    },
    'teacher': {
        '__me__': ('adult', 'long', 'brown', 1, ['collar']),
        'priya': ('adult', 'long', 'black', 3, []),
        'mark': ('adult', 'short', 'blonde', 0, ['beard']),
        'tess': ('adult', 'ponytail', 'auburn', 0, []),
        'bello': ('older', 'bun', 'black', 5, ['glasses']),
        'dan': ('adult', 'crop', 'brown', 2, ['beard']),
        'kate': ('adult', 'long', 'brown', 1, []),
        'lucy': ('adult', 'curly', 'blonde', 0, []),
        'ola': ('adult', 'crop', 'black', 5, []),
    },
    'waitress': {
        '__me__': ('adult', 'ponytail', 'black', 2, ['apron']),
        'mick': ('older', 'bald', 'grey', 0, ['beard']),
        'dee': ('adult', 'curly', 'auburn', 1, []),
        'jonno': ('adult', 'short', 'black', 4, ['apron']),
        'rosa': ('adult', 'bun', 'black', 2, ['collar']),
        'bea': ('adult', 'long', 'blonde', 0, ['glasses']),
        'mum': ('older', 'short', 'grey', 2, []),
        'tia': ('adult', 'curly', 'black', 5, []),
        'marcus': ('adult', 'crop', 'black', 4, []),
    },
    'lawyer': {
        '__me__': ('adult', 'short', 'brown', 1, ['suit']),
        'hale': ('older', 'short', 'grey', 0, ['suit', 'glasses']),
        'reyes': ('adult', 'long', 'black', 2, ['suit']),
        'helen': ('older', 'bun', 'blonde', 0, ['suit']),
        'nia': ('adult', 'curly', 'black', 4, ['glasses']),
        'alex': ('adult', 'long', 'auburn', 1, []),
        'dad': ('older', 'bald', 'grey', 1, ['glasses']),
        'ben': ('adult', 'short', 'blonde', 0, ['beard']),
        'chloe': ('adult', 'ponytail', 'brown', 2, []),
    },
    'careHome': {
        '__me__': ('older', 'bun', 'white', 1, ['glasses']),
        'carol': ('adult', 'short', 'brown', 1, []),
        'peter': ('adult', 'short', 'grey', 1, ['beard']),
        'lily': ('teen', 'long', 'blonde', 0, []),
        'josh': ('teen', 'short', 'brown', 0, ['hoodie']),
        'joy': ('adult', 'curly', 'black', 5, ['scrubs']),
        'edith': ('older', 'curly', 'white', 0, []),
        'margaret': ('older', 'short', 'white', 0, ['glasses']),
    },
    'student': {
        '__me__': ('teen', 'curly', 'black', 4, ['hoodie']),
        'kai': ('teen', 'short', 'black', 2, ['hoodie']),
        'mo': ('teen', 'crop', 'black', 3, []),
        'jess': ('teen', 'ponytail', 'auburn', 0, []),
        'mum': ('older', 'long', 'black', 4, []),
        'dad': ('older', 'short', 'grey', 4, ['beard']),
        'ellie': ('teen', 'long', 'brown', 1, []),
        'tom': ('teen', 'short', 'blonde', 0, []),
        'ahmed': ('adult', 'short', 'black', 3, ['glasses', 'beard']),
    },
    'parentOfThree': {
        '__me__': ('adult', 'long', 'brown', 2, []),
        'chris': ('adult', 'short', 'brown', 2, ['beard']),
        'mia': ('kid', 'bun', 'brown', 2, []),
        'leo': ('teen', 'short', 'brown', 2, ['hoodie']),
        'ava': ('adult', 'long', 'brown', 2, []),
        'rose': ('older', 'curly', 'white', 1, ['glasses']),
        'hana': ('adult', 'bun', 'black', 1, []),
        'jade': ('adult', 'ponytail', 'black', 4, []),
        'sol': ('adult', 'crop', 'black', 5, []),
        'ben': ('adult', 'short', 'auburn', 0, ['collar']),
    },
    'newInTown': {
        '__me__': ('adult', 'short', 'blonde', 0, []),
        'mum': ('older', 'short', 'white', 0, []),
        'nat': ('adult', 'long', 'auburn', 0, []),
        'ollie': ('adult', 'curly', 'brown', 1, ['beard']),
        'fran': ('adult', 'bun', 'black', 3, []),
        'lena': ('adult', 'ponytail', 'blonde', 0, ['collar']),
        'kofi': ('adult', 'crop', 'black', 5, []),
        'mrsdunn': ('older', 'curly', 'grey', 1, ['glasses']),
    },
}

# Groups: a symbol each.
GROUPS = {
    'patients': 'cross', 'class': 'blocks', 'parents': 'heads', 'choir': 'note', 'regulars': 'glass',
    'court': 'scales', 'clients': 'briefcase', 'bingo': 'ball', 'church': 'church', 'study': 'book',
    'climbing': 'mountain', 'gate': 'gate', 'oldteam': 'briefcase', 'newteam': 'heads', 'running': 'shoe',
}


def person(seed: str, age: str, style: str, hair: str, skin: int, extras: list[str]) -> Image.Image:
    rnd = random.Random(seed)
    im = Image.new('RGB', (S, S), rnd.choice(BG))
    d = ImageDraw.Draw(im)
    sk = SKIN[skin]
    hc = HAIR[hair]
    kid = age == 'kid'
    teen = age == 'teen'
    head_r = 66 if kid else 62 if teen else 60
    cx, cy = S // 2, 148 if kid else 140
    shirt = rnd.choice(SHIRT)
    if 'scrubs' in extras:
        shirt = '#3aa39a'
    if 'suit' in extras:
        shirt = '#2c3442'
    if 'hoodie' in extras:
        shirt = rnd.choice(['#5a6b8c', '#7a3e48', '#3f6d4e'])

    # Long hair falls behind the shoulders.
    if style in ('long',):
        d.rounded_rectangle([cx - head_r - 10, cy - 20, cx + head_r + 10, cy + head_r + 70], radius=40, fill=hc)
    # Shoulders and neck.
    d.ellipse([cx - 120, cy + 70, cx + 120, cy + 260], fill=shirt)
    if 'suit' in extras:
        d.polygon([(cx, cy + 82), (cx - 26, cy + 140), (cx, cy + 200), (cx + 26, cy + 140)], fill='#f2f2f2')
        d.polygon([(cx, cy + 96), (cx - 8, cy + 120), (cx, cy + 170), (cx + 8, cy + 120)], fill='#a8323a')
    if 'collar' in extras:
        d.polygon([(cx - 34, cy + 78), (cx, cy + 108), (cx + 34, cy + 78), (cx + 18, cy + 74), (cx, cy + 92), (cx - 18, cy + 74)], fill='#f2f2f2')
    if 'apron' in extras:
        d.rectangle([cx - 46, cy + 110, cx + 46, cy + 200], fill='#efe7d6')
    if 'hoodie' in extras:
        d.arc([cx - 50, cy + 60, cx + 50, cy + 120], 0, 180, fill='#00000040', width=6)
    d.rectangle([cx - 20, cy + 40, cx + 20, cy + 90], fill=sk)
    # Head and ears.
    d.ellipse([cx - head_r - 8, cy - 8, cx - head_r + 12, cy + 26], fill=sk)
    d.ellipse([cx + head_r - 12, cy - 8, cx + head_r + 8, cy + 26], fill=sk)
    d.ellipse([cx - head_r, cy - head_r - 6, cx + head_r, cy + head_r], fill=sk)
    # Hair on top.
    top = [cx - head_r - 4, cy - head_r - 12, cx + head_r + 4, cy + 10]
    if style == 'short':
        d.chord(top, 180, 360, fill=hc)
        d.rectangle([cx - head_r - 2, cy - 30, cx - head_r + 12, cy + 4], fill=hc)
        d.rectangle([cx + head_r - 12, cy - 30, cx + head_r + 2, cy + 4], fill=hc)
    elif style == 'crop':
        d.chord([top[0] + 6, top[1] + 6, top[2] - 6, top[3] - 10], 185, 355, fill=hc)
    elif style in ('long', 'bun', 'ponytail'):
        d.chord(top, 180, 360, fill=hc)
        d.pieslice([cx - head_r - 4, cy - head_r - 12, cx + 10, cy + 30], 180, 270, fill=hc)
        if style == 'bun':
            d.ellipse([cx - 26, cy - head_r - 50, cx + 26, cy - head_r + 2], fill=hc)
        if style == 'ponytail':
            d.ellipse([cx + head_r - 6, cy - 20, cx + head_r + 34, cy + 60], fill=hc)
    elif style == 'curly':
        for k in range(9):
            a = 3.14159 * (1.0 + k / 8)
            import math
            x = cx + (head_r + 2) * math.cos(a)
            y = cy - 6 + (head_r + 6) * math.sin(a)
            d.ellipse([x - 22, y - 22, x + 22, y + 22], fill=hc)
    elif style == 'bald':
        d.chord([cx - head_r - 2, cy - 30, cx - head_r + 16, cy + 20], 90, 270, fill=hc)
        d.chord([cx + head_r - 16, cy - 30, cx + head_r + 2, cy + 20], 270, 90, fill=hc)
    # Face.
    eye_y = cy + 6
    for ex in (cx - 22, cx + 22):
        d.ellipse([ex - 6, eye_y - 7, ex + 6, eye_y + 7], fill='#2a211d')
    if 'glasses' in extras:
        for ex in (cx - 22, cx + 22):
            d.ellipse([ex - 17, eye_y - 15, ex + 17, eye_y + 15], outline='#2a211d', width=4)
        d.line([cx - 5, eye_y, cx + 5, eye_y], fill='#2a211d', width=4)
    if 'beard' in extras:
        d.chord([cx - head_r + 4, cy - 10, cx + head_r - 4, cy + head_r + 8], 0, 180, fill=hc)
        d.ellipse([cx - 18, cy + 30, cx + 18, cy + 42], fill=sk)
    d.arc([cx - 18, cy + 18, cx + 18, cy + 44], 20, 160, fill='#7a3b32', width=5)
    if age == 'older':
        d.line([cx - 32, cy - 26, cx - 14, cy - 28], fill='#00000030', width=3)
        d.line([cx + 14, cy - 28, cx + 32, cy - 26], fill='#00000030', width=3)
    if 'scrubs' in extras:
        d.arc([cx - 50, cy + 80, cx + 50, cy + 190], 200, 340, fill='#d0d4d8', width=7)
    return im


def group(seed: str, symbol: str) -> Image.Image:
    rnd = random.Random(seed)
    im = Image.new('RGB', (S, S), rnd.choice(BG))
    d = ImageDraw.Draw(im)
    c = '#2b3550'
    w = '#ffffff'
    m = S // 2
    if symbol == 'cross':
        d.rounded_rectangle([m - 30, m - 90, m + 30, m + 90], 10, fill='#c0392b')
        d.rounded_rectangle([m - 90, m - 30, m + 90, m + 30], 10, fill='#c0392b')
    elif symbol == 'blocks':
        for (x, y, col, ch) in [(m - 95, m - 10, '#e74c3c', 'A'), (m - 30, m - 10, '#3498db', 'B'), (m + 35, m - 10, '#f1c40f', 'C'), (m - 62, m - 75, '#27ae60', '1')]:
            d.rounded_rectangle([x, y, x + 60, y + 60], 8, fill=col)
            d.text((x + 30, y + 30), ch, fill=w, font=font(40), anchor='mm')
    elif symbol == 'heads':
        for k, x in enumerate([m - 70, m + 70, m]):
            sh = SHIRT[k * 3 % len(SHIRT)]
            y = m + (10 if k < 2 else -10)
            d.ellipse([x - 60, y + 30, x + 60, y + 150], fill=sh)
            d.ellipse([x - 34, y - 50, x + 34, y + 18], fill=SKIN[(k * 2 + 1) % len(SKIN)])
    elif symbol == 'note':
        d.ellipse([m - 80, m + 30, m - 20, m + 80], fill=c)
        d.ellipse([m + 20, m + 10, m + 80, m + 60], fill=c)
        d.rectangle([m - 30, m - 90, m - 18, m + 55], fill=c)
        d.rectangle([m + 70, m - 110, m + 82, m + 35], fill=c)
        d.polygon([(m - 30, m - 90), (m + 82, m - 110), (m + 82, m - 80), (m - 30, m - 60)], fill=c)
    elif symbol == 'glass':
        d.polygon([(m - 70, m - 90), (m + 70, m - 90), (m + 50, m + 90), (m - 50, m + 90)], fill='#f0b429')
        d.rectangle([m - 70, m - 100, m + 70, m - 60], fill=w)
        d.rounded_rectangle([m + 50, m - 50, m + 100, m + 40], 20, outline='#f0b429', width=14)
    elif symbol == 'scales':
        d.rectangle([m - 6, m - 100, m + 6, m + 90], fill=c)
        d.rectangle([m - 70, m + 80, m + 70, m + 100], fill=c)
        d.line([m - 100, m - 70, m + 100, m - 70], fill=c, width=10)
        for x in (m - 90, m + 90):
            d.line([x, m - 70, x - 30, m], fill=c, width=4)
            d.line([x, m - 70, x + 30, m], fill=c, width=4)
            d.chord([x - 40, m - 30, x + 40, m + 30], 0, 180, fill=c)
    elif symbol == 'briefcase':
        d.rounded_rectangle([m - 100, m - 50, m + 100, m + 90], 16, fill='#7a4b2a')
        d.rounded_rectangle([m - 40, m - 85, m + 40, m - 45], 10, outline='#7a4b2a', width=14)
        d.rectangle([m - 100, m, m + 100, m + 10], fill='#5c3820')
    elif symbol == 'ball':
        d.ellipse([m - 90, m - 90, m + 90, m + 90], fill='#e74c3c')
        d.ellipse([m - 50, m - 50, m + 50, m + 50], fill=w)
        d.text((m, m), '42', fill=c, font=font(60), anchor='mm')
    elif symbol == 'church':
        d.rectangle([m - 70, m - 10, m + 70, m + 100], fill=w)
        d.polygon([(m - 90, m - 10), (m, m - 90), (m + 90, m - 10)], fill='#8a4f3a')
        d.rectangle([m - 6, m - 140, m + 6, m - 85], fill=c)
        d.rectangle([m - 24, m - 122, m + 24, m - 110], fill=c)
        d.rounded_rectangle([m - 20, m + 40, m + 20, m + 100], 18, fill='#8a4f3a')
    elif symbol == 'book':
        d.polygon([(m, m - 60), (m - 110, m - 80), (m - 110, m + 80), (m, m + 100)], fill='#2f6fde')
        d.polygon([(m, m - 60), (m + 110, m - 80), (m + 110, m + 80), (m, m + 100)], fill='#4a8af0')
        for k in range(4):
            d.line([m + 20, m - 40 + 30 * k, m + 90, m - 52 + 30 * k], fill=w, width=5)
    elif symbol == 'mountain':
        d.polygon([(m - 120, m + 90), (m - 20, m - 90), (m + 70, m + 90)], fill='#5d6d7e')
        d.polygon([(m - 20, m + 90), (m + 60, m - 30), (m + 130, m + 90)], fill='#7f8c8d')
        d.polygon([(m - 20, m - 90), (m - 48, m - 40), (m + 8, m - 40)], fill=w)
    elif symbol == 'gate':
        for x in range(m - 100, m + 101, 40):
            d.rectangle([x - 6, m - 70, x + 6, m + 100], fill=c)
            d.polygon([(x - 10, m - 70), (x, m - 95), (x + 10, m - 70)], fill=c)
        d.rectangle([m - 110, m - 40, m + 110, m - 28], fill=c)
        d.rectangle([m - 110, m + 60, m + 110, m + 72], fill=c)
    elif symbol == 'shoe':
        d.chord([m - 110, m - 60, m + 110, m + 120], 180, 360, fill='#e67e22')
        d.rectangle([m - 110, m + 30, m + 110, m + 60], fill=c)
        for k in range(3):
            d.line([m - 40 + 28 * k, m - 20, m - 20 + 28 * k, m + 10], fill=w, width=6)
    return im


def jpeg64(im: Image.Image) -> str:
    buf = io.BytesIO()
    im.resize((FINAL, FINAL), Image.LANCZOS).save(buf, 'JPEG', quality=80)
    return base64.b64encode(buf.getvalue()).decode()


def main() -> None:
    out: dict[str, str] = {}
    for scenario, people in PEOPLE.items():
        for pid, (age, style, hair, skin, extras) in people.items():
            out[f'{scenario}:{pid}'] = jpeg64(person(f'{scenario}:{pid}', age, style, hair, skin, extras))
        for gid, symbol in GROUPS.items():
            out[f'{scenario}:{gid}'] = jpeg64(group(f'{scenario}:{gid}', symbol))
    # Only keep groups a scenario actually has (unused ones are dropped by the app anyway, but keep the file small).
    lines = [
        '/**',
        ' * Illustrated avatars for the synthetic "Lives" scenarios (drawn by',
        ' * scripts/make-scenario-avatars.py; no real people). Keys are "<scenario>:<person id>", with',
        ' * "<scenario>:__me__" for the scenario\'s own "You". Base64 JPEGs, 160 px square. Generated: do not edit.',
        ' */',
        'export const SCENARIO_AVATARS: Record<string, string> = {',
    ]
    used = json.loads((ROOT / 'scripts/scenario-people.json').read_text())
    keep = {f"{s['id']}:{p['id']}" for s in used for p in s['people']} | {f'{s}:__me__' for s in PEOPLE}
    for k in sorted(out):
        if k in keep:
            lines.append(f"  '{k}': '{out[k]}',")
    lines.append('};')
    OUT.write_text('\n'.join(lines) + '\n')
    missing = sorted(keep - set(out))
    print(f'wrote {len([k for k in out if k in keep])} avatars to {OUT.relative_to(ROOT)}; missing: {missing}')


if __name__ == '__main__':
    main()
