let pending: string | null = null

export const setPendingMessage = (text: string) => {
	pending = text
}

export const consumePendingMessage = (): string | null => {
	const text = pending
	pending = null
	return text
}
