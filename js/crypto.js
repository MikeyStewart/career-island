// Decrypts data.enc (written by tools/encrypt.py) with a passphrase.

export function normalise(passphrase) {
  return passphrase.trim().toLowerCase().split(/\s+/).join(' ');
}

const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

let cached;

export async function unlock(passphrase) {
  cached ??= fetch('data.enc', { cache: 'no-store' }).then((r) => {
    if (!r.ok) throw new Error('Could not load game data');
    return r.json();
  });
  const box = await cached;

  const baseKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(normalise(passphrase)), 'PBKDF2', false, ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(box.salt), iterations: box.iter },
    baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  );

  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, key, fromB64(box.ct));
  } catch {
    return null; // wrong passphrase
  }
  return JSON.parse(new TextDecoder().decode(plain));
}
