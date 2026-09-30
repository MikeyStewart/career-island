#!/usr/bin/env python3
"""Encrypt content/cv.json + content/cv.pdf into data.enc.

The key is derived from the passphrase with PBKDF2-SHA256 and the payload is
sealed with AES-256-GCM, matching js/crypto.js (Web Crypto) in the browser.

Usage:
  python3 -m venv tools/.venv && tools/.venv/bin/pip install cryptography
  tools/.venv/bin/python tools/encrypt.py            # prompts for the passphrase
  PASSPHRASE="..." tools/.venv/bin/python tools/encrypt.py
"""
import base64
import getpass
import json
import os
import pathlib
import sys

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ROOT = pathlib.Path(__file__).resolve().parent.parent
ITERATIONS = 600_000


def normalise(passphrase: str) -> str:
    # Must match normalise() in js/crypto.js.
    return " ".join(passphrase.strip().lower().split())


def main() -> None:
    passphrase = os.environ.get("PASSPHRASE") or getpass.getpass("Passphrase: ")
    passphrase = normalise(passphrase)
    if len(passphrase) < 8:
        sys.exit("Passphrase is too short - use at least three words.")

    cv = json.loads((ROOT / "content/cv.json").read_text(encoding="utf-8"))
    pdf = (ROOT / "content/cv.pdf").read_bytes()
    payload = json.dumps({"cv": cv, "pdf": base64.b64encode(pdf).decode()}).encode()

    salt, iv = os.urandom(16), os.urandom(12)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITERATIONS).derive(
        passphrase.encode()
    )
    ciphertext = AESGCM(key).encrypt(iv, payload, None)

    b64 = lambda b: base64.b64encode(b).decode()
    out = {"v": 1, "iter": ITERATIONS, "salt": b64(salt), "iv": b64(iv), "ct": b64(ciphertext)}
    (ROOT / "data.enc").write_text(json.dumps(out))
    print(f"Wrote data.enc ({len(ciphertext) // 1024} KB)")


if __name__ == "__main__":
    main()
