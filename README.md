# Career Island

A tiny low-poly 3D exploration game (Three.js, no build step). Talk to islanders, collect five pounamu and light the lighthouse (about 10 minutes).

All game content is encrypted in `data.enc` (AES-256-GCM, key from PBKDF2-SHA256), so the page shows nothing until you enter the right code.

## Run locally

```bash
python3 -m http.server 8765
```

Open http://localhost:8765 (add `?debug` to expose a test hook on `window.__game`).

## Update content

The source content lives in `content/cv.json` and `content/cv.pdf`. These files are gitignored and never committed.

```bash
python3 -m venv tools/.venv && tools/.venv/bin/pip install cryptography
tools/.venv/bin/python tools/encrypt.py   # prompts for the passphrase
```

Commit the new `data.enc` and push. GitHub Pages redeploys automatically.

## Controls

WASD/arrows to walk (Shift to run), E/Space to talk, J for the journal, the camera follows automatically (Z/X rotate, C recentre, +/- zoom, or drag / two-finger swipe). On touch screens there's an on-screen joystick and a talk button.
