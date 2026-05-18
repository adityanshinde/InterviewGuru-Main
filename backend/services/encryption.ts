import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

function getEncryptionKey(): Buffer {
	const keyHex = process.env.API_KEY_ENCRYPTION_KEY?.trim();
	if (!keyHex || keyHex.length !== 64) {
		throw new Error(
			'API_KEY_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
			'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
		);
	}
	return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt a string value for secure storage
 * Returns base64-encoded ciphertext with IV and auth tag
 */
export function encrypt(plaintext: string): string {
	const key = getEncryptionKey();
	const iv = crypto.randomBytes(IV_LENGTH);
	const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

	const encrypted = Buffer.concat([
		cipher.update(plaintext, 'utf8'),
		cipher.final(),
	]);

	const authTag = cipher.getAuthTag();

	// Format: iv (16 bytes) + authTag (16 bytes) + ciphertext
	const combined = Buffer.concat([iv, authTag, encrypted]);
	return combined.toString('base64');
}

/**
 * Decrypt a base64-encoded ciphertext
 */
export function decrypt(encryptedBase64: string): string {
	const key = getEncryptionKey();
	const combined = Buffer.from(encryptedBase64, 'base64');

	const iv = combined.subarray(0, IV_LENGTH);
	const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
	const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

	const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(authTag);

	const decrypted = Buffer.concat([
		decipher.update(ciphertext),
		decipher.final(),
	]);

	return decrypted.toString('utf8');
}

/**
 * Get the first N characters of a string for display (e.g., "gsk_abc...")
 */
export function getKeyPrefix(key: string, prefixLength = 8): string {
	if (key.length <= prefixLength + 3) {
		return key.substring(0, 4) + '...';
	}
	return key.substring(0, prefixLength) + '...';
}

/**
 * Hash a value for comparison (e.g., checking if a key already exists)
 */
export function hashValue(value: string): string {
	return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Generate a secure random token
 */
export function generateSecureToken(bytes = 32): string {
	return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Securely compare two strings in constant time
 */
export function secureCompare(a: string, b: string): boolean {
	const bufA = Buffer.from(a, 'utf8');
	const bufB = Buffer.from(b, 'utf8');
	if (bufA.length !== bufB.length) return false;
	return crypto.timingSafeEqual(bufA, bufB);
}
