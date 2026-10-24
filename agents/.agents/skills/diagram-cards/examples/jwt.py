"""Worked example: how a JWT login works, as three cards.

    python3 examples/jwt.py /tmp/jwt.json && node scripts/render.mjs /tmp/jwt.json
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
from grid import Grid, save

cards = {}

# 1. Flow: who asks for a token, what the server does, where the token goes.
g = Grid(36, 71)
callers = [g.box(0, [a, b], left=left, width=17) for left, a, b in [
    (0, 'login form', 'POST /login'), (18, 'cli', 'device code'),
    (36, 'mobile app', 'refresh'), (54, 'sso callback', '/oauth/cb')]]
C = 35
issue = g.box(7, ['issueToken()', '', 'sub    ← user id', 'scope  ← role, plan', 'exp    ← now + 15 min'], center=C)
g.highlight(8, r'issueToken', 'fn')
payload = g.box(16, ['{sub, scope, iat, exp}'], center=C)
g.put(17, payload['left'] - 6, 'JSON', 'muted')
sign = g.box(21, ['   HMAC · SHA-256', '   JWT_SIGNING_', '   SECRET'], center=C, double=True, layer='accent')
g.icon(sign, 'password', layer='accent')
token = g.box(28, ['   eyJhbGciOi….eyJzdWIi….sig'], center=C)
g.icon(token, 'license')
cookie = g.box(33, ['   Set-Cookie: session=…'], center=C)
g.icon(cookie, 'locked')
for c in callers:
    g.arrow(c, issue, via_row=5)
g.arrow(issue, payload); g.arrow(payload, sign); g.arrow(sign, token); g.arrow(token, cookie)
cards['flow'] = g.card('jwt-issue.mmd')

# 2. Anatomy of a token: three parts, the signature in the accent.
head, body, sig = 'eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiJ1XzQyIiwic2NvcGUiOjUsImV4cCI6MTcwMDAwMDkwMH0', 'SflKxwRJSMeKKF2Q…'
k = Grid(5, len(head) + len(body) + len(sig) + 2)
k.put(0, 0, f'{head}.{body}.')
k.put(0, len(head) + len(body) + 2, sig, 'accent')
def bracket(c0, c1, labels, layer='ink'):
    w = c1 - c0 + 1; mid = w // 2
    k.put(1, c0, '└' + '─' * (mid - 1) + '┬' + '─' * (w - mid - 2) + '┘', layer)
    k.put(2, c0 + mid, '│', layer)
    for i, s in enumerate(labels):
        k.put(3 + i, max(0, c0 + mid - len(s) // 2), s, layer)
b0 = len(head) + 1; s0 = b0 + len(body) + 1
bracket(0, len(head) - 1, ['header', '{"alg":"HS256"}'])
bracket(b0, b0 + len(body) - 1, ['base64url of the claims', '{"sub":"u_42","scope":5,"exp":1700000900}'])
bracket(s0, s0 + len(sig) - 1, ['signature', 'HMAC'], 'accent')
cards['anatomy'] = k.card('jwt-anatomy.mmd')

# 3. Scope bitfield with one value worked through; the set bits in the accent.
rows = [('0', '1', 'READ', '┐ access', True), ('1', '2', 'WRITE', '│', False),
        ('2', '4', 'ADMIN', '┘', True), ('3', '8', 'BILLING', '  owner only', False),
        ('4', '16', 'BETA', '┐ features', False), ('5', '32', 'EXPORT', '┘', False)]
f = Grid(len(rows) + 4, 52)
f.put(0, 0, 'bit  value  flag'); f.put(1, 0, '───  ─────  ' + '─' * 20)
for i, (bit, val, name, note, on) in enumerate(rows):
    f.put(2 + i, 0, f'{bit:>3}  {val:>5}  {name}', 'accent' if on else 'ink')
    if note:
        f.put(2 + i, 33, note)
f.put(len(rows) + 3, 0, '5 = 1 + 4 → read, admin', 'accent')
cards['flags'] = f.card('jwt-scope.mmd')

save(cards, sys.argv[1] if len(sys.argv) > 1 else 'cards.json')
