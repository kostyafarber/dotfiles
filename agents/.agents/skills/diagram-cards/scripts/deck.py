#!/usr/bin/env python3
"""Step through a folder of PNG cards in the terminal (kitty graphics protocol).

← / → (or h / l, space) step, g / G first / last, + / - zoom, 0 resets, q quits.
Cards open at their natural size (2x PNG = 1 device pixel each), shrunk to fit if needed.
The folder is watched: when cards are added or re-rendered, the view refreshes.
"""
import base64, fcntl, glob, os, select, signal, struct, sys, termios, tty

deck = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/.cache/diagram-cards/deck')
out = sys.stdout
zoom = [1.0]

def cards():
    return sorted(glob.glob(os.path.join(deck, '*.png')))

def stamp():
    return tuple((f, os.path.getmtime(f)) for f in cards())

def png_size(path):
    with open(path, 'rb') as f:
        head = f.read(24)
    return struct.unpack('>II', head[16:24])

def cell_px():
    rows, cols, xpx, ypx = struct.unpack('HHHH', fcntl.ioctl(out.fileno(), termios.TIOCGWINSZ, b'\0' * 8))
    cw, ch = (xpx / cols, ypx / rows) if xpx and ypx else (9.0, 19.0)
    return rows, cols, cw, ch

def draw(i):
    files = cards()
    out.write('\033_Ga=d,d=A\033\\\033[2J\033[H')   # delete images, clear
    if not files:
        out.write(f'\n  \033[2mwaiting for cards in {deck}\033[0m'); out.flush(); return i
    i = max(0, min(i, len(files) - 1))
    path = files[i]
    rows, cols, cw, ch = cell_px()
    name = os.path.basename(path)[3:-4] if os.path.basename(path)[2:3] == '-' else os.path.basename(path)[:-4]
    pct = f'  \033[2m{round(zoom[0] * 100)}%\033[0m' if zoom[0] != 1.0 else ''
    out.write(f'\n  \033[1m{i + 1}/{len(files)}\033[0m  {name}{pct}\n\n')
    w, h = png_size(path)
    room_c, room_r = cols - 4, rows - 6
    fit = min(room_c * cw / w, room_r * ch / h)
    scale = min(fit, 1.0) * zoom[0]   # 1.0 = natural size on a retina pane
    c = max(1, int(w * scale / cw)); r = max(1, int(h * scale / ch))
    pad = max(0, (cols - c) // 2)
    out.write(' ' * pad)
    data = base64.b64encode(open(path, 'rb').read()).decode()
    chunks = [data[k:k + 4096] for k in range(0, len(data), 4096)]
    for n, chunk in enumerate(chunks):
        more = 1 if n < len(chunks) - 1 else 0
        ctrl = f'a=T,f=100,q=2,c={c},r={r},m={more}' if n == 0 else f'm={more}'
        out.write(f'\033_G{ctrl};{chunk}\033\\')
    dots = ' '.join('●' if k == i else '○' for k in range(len(files)))
    out.write(f'\033[{rows};1H  \033[2m{dots}    ← →  step   + -  zoom   0  reset   q  quit\033[0m')
    out.flush()
    return i

def main():
    fd = sys.stdin.fileno(); old = termios.tcgetattr(fd)
    tty.setcbreak(fd)
    out.write('\033[?25l')   # hide cursor
    resized = [False]
    signal.signal(signal.SIGWINCH, lambda *_: resized.__setitem__(0, True))   # pane zoomed or resized
    i, seen = 0, stamp()
    i = draw(i)
    try:
        while True:
            ready, _, _ = select.select([sys.stdin], [], [], 0.2)
            if resized[0]:
                resized[0] = False; i = draw(i); continue
            if not ready:
                now = stamp()
                if now != seen:   # cards changed on disk: jump to the newest one changed
                    changed = [f for f, m in now if (f, m) not in seen]
                    files = cards()
                    if changed and changed[-1] in files: i = files.index(changed[-1])
                    seen = now; i = draw(i)
                continue
            key = os.read(fd, 8).decode(errors='ignore')
            if key in ('q', '\x03'): break
            elif key in ('\x1b[C', 'l', ' ', 'j'): i = draw(i + 1)
            elif key in ('\x1b[D', 'h', 'k'): i = draw(i - 1)
            elif key == 'g': i = draw(0)
            elif key == 'G': i = draw(len(cards()) - 1)
            elif key in ('+', '='): zoom[0] = min(4.0, zoom[0] * 1.25); i = draw(i)
            elif key in ('-', '_'): zoom[0] = max(0.25, zoom[0] / 1.25); i = draw(i)
            elif key == '0': zoom[0] = 1.0; i = draw(i)
            elif key == 'r': i = draw(i)
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)
        out.write('\033_Ga=d,d=A\033\\\033[?25h\033[2J\033[H'); out.flush()

main()
