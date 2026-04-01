import crypto from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16
const TAG_LENGTH = 16
const KEY_LENGTH = 32

const getencryptionkey = (): Buffer => {
	const raw = process.env.ENCRYPTION_KEY
	if (!raw) {
		if (process.env.NODE_ENV === "production") {
			throw new Error("ENCRYPTION_KEY environment variable is required in production")
		}
		return crypto.scryptSync("dev-encryption-secret-do-not-use", "salt", KEY_LENGTH) as Buffer
	}
	if (/^[0-9a-f]{64}$/i.test(raw)) {
		return Buffer.from(raw, "hex")
	}
	return crypto.scryptSync(raw, "openzosma-salt", KEY_LENGTH) as Buffer
}

export const decrypt = (ciphertext: string): string => {
	const key = getencryptionkey()
	const buf = Buffer.from(ciphertext, "base64")
	const iv = buf.subarray(0, IV_LENGTH)
	const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
	const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH)
	const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
	decipher.setAuthTag(tag)
	return decipher.update(encrypted) + decipher.final("utf8")
}

export const safeDecrypt = (value: string): string => {
	try {
		return decrypt(value)
	} catch {
		return value
	}
}
