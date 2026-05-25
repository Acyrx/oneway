const STORAGE_KEY = "lumi_keypair";
const ALGO = { name: "ECDH", namedCurve: "P-256" } as const;

export interface KeyPair {
  publicKeyStr: string;
  privateKeyStr: string;
}

export function isEncryptedPayload(text: string): boolean {
  try {
    const obj = JSON.parse(text);
    return obj.v === 1 && typeof obj.c === "string" && typeof obj.iv === "string";
  } catch {
    return false;
  }
}

async function generateKeyPair(): Promise<KeyPair> {
  const pair = await crypto.subtle.generateKey(ALGO, true, ["deriveKey", "deriveBits"]);
  const [pub, priv] = await Promise.all([
    crypto.subtle.exportKey("jwk", pair.publicKey),
    crypto.subtle.exportKey("jwk", pair.privateKey),
  ]);
  return { publicKeyStr: JSON.stringify(pub), privateKeyStr: JSON.stringify(priv) };
}

export async function getOrCreateKeyPair(): Promise<KeyPair> {
  if (typeof window === "undefined") return { publicKeyStr: "", privateKeyStr: "" };
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try { return JSON.parse(stored); } catch {}
  }
  const pair = await generateKeyPair();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pair));
  return pair;
}

async function importPublicKey(jwkStr: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", JSON.parse(jwkStr), ALGO, true, []);
}

async function importPrivateKey(jwkStr: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", JSON.parse(jwkStr), ALGO, true, ["deriveKey", "deriveBits"]);
}

async function deriveSharedKey(myPrivKey: CryptoKey, theirPubKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: theirPubKey },
    myPrivKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptText(text: string, myPrivKeyStr: string, theirPubKeyStr: string): Promise<string> {
  const [myPrivKey, theirPubKey] = await Promise.all([
    importPrivateKey(myPrivKeyStr),
    importPublicKey(theirPubKeyStr),
  ]);
  const sharedKey = await deriveSharedKey(myPrivKey, theirPubKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    sharedKey,
    new TextEncoder().encode(text)
  );
  return JSON.stringify({
    v: 1,
    c: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    iv: btoa(String.fromCharCode(...iv)),
  });
}

export async function decryptText(encryptedStr: string, myPrivKeyStr: string, theirPubKeyStr: string): Promise<string> {
  try {
    if (!isEncryptedPayload(encryptedStr)) return encryptedStr;
    const { c, iv: ivB64 } = JSON.parse(encryptedStr);
    const [myPrivKey, theirPubKey] = await Promise.all([
      importPrivateKey(myPrivKeyStr),
      importPublicKey(theirPubKeyStr),
    ]);
    const sharedKey = await deriveSharedKey(myPrivKey, theirPubKey);
    const iv = Uint8Array.from(atob(ivB64), ch => ch.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(c), ch => ch.charCodeAt(0));
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, sharedKey, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch {
    return "🔒 [Could not decrypt]";
  }
}
