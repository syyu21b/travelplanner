// 여권 정보를 비밀번호 기반으로 암호화/복호화하는 유틸리티 (Web Crypto API: PBKDF2 + AES-GCM)

export interface PassportInfo {
  passportNumber: string;
  fullNameEnglish: string;
  nationality: string;
  dateOfBirth: string;
  sex: 'M' | 'F' | '';
  issueDate: string;
  expiryDate: string;
  issuingCountry: string;
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  salt: string;
}

const PBKDF2_ITERATIONS = 150000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptWithPassword(plaintext: string, password: string): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return {
    ciphertext: toBase64(new Uint8Array(ciphertextBuf)),
    iv: toBase64(iv),
    salt: toBase64(salt),
  };
}

// 비밀번호가 틀리거나 데이터가 손상된 경우 null 반환
export async function decryptWithPassword(payload: EncryptedPayload, password: string): Promise<string | null> {
  try {
    const key = await deriveKey(password, fromBase64(payload.salt));
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(payload.iv) },
      key,
      fromBase64(payload.ciphertext)
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    return null;
  }
}

export async function encryptPassportInfo(data: PassportInfo, password: string): Promise<EncryptedPayload> {
  return encryptWithPassword(JSON.stringify(data), password);
}

export async function decryptPassportInfo(payload: EncryptedPayload, password: string): Promise<PassportInfo | null> {
  const json = await decryptWithPassword(payload, password);
  if (!json) return null;
  try {
    return JSON.parse(json) as PassportInfo;
  } catch {
    return null;
  }
}
