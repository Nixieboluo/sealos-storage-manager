export interface FileBrowserErrorShape {
	readonly status: number
	readonly code: string
	readonly message: string
	readonly details?: unknown
}

export class FileBrowserError extends Error {
	readonly status: number
	readonly code: string
	readonly details?: unknown

	constructor(shape: FileBrowserErrorShape) {
		super(shape.message)
		this.name = 'FileBrowserError'
		this.status = shape.status
		this.code = shape.code
		this.details = shape.details
	}
}

export async function errorFromResponse(response: Response): Promise<FileBrowserError> {
	const text = await response.text().catch(() => '')
	let message = text || response.statusText || 'File Browser request failed'
	try {
		const body = JSON.parse(text) as { message?: string, error?: { message?: string, code?: string } }
		message = body.error?.message ?? body.message ?? message
	}
	catch {
		// Keep text fallback.
	}
	return new FileBrowserError({
		status: response.status,
		code: response.status === 409 ? 'FILE_CONFLICT' : `FILEBROWSER_${response.status}`,
		message,
	})
}
