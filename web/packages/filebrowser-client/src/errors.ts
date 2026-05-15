export interface FileBrowserErrorShape {
	readonly status: number
	readonly code: FileBrowserErrorCode
	readonly message: string
	readonly details?: unknown
}

export const fileBrowserErrorCodes = [
	'FILE_CONFLICT',
	'FILEBROWSER_BAD_REQUEST',
	'FILEBROWSER_UNAUTHORIZED',
	'FILEBROWSER_FORBIDDEN',
	'FILEBROWSER_NOT_FOUND',
	'FILEBROWSER_REQUEST_TIMEOUT',
	'FILEBROWSER_PAYLOAD_TOO_LARGE',
	'FILEBROWSER_SERVER_ERROR',
	'FILEBROWSER_BAD_GATEWAY',
	'FILEBROWSER_SERVICE_UNAVAILABLE',
	'FILEBROWSER_GATEWAY_TIMEOUT',
	'FILEBROWSER_REQUEST_FAILED',
	'TUS_UPLOAD_FAILED',
] as const

export type FileBrowserErrorCode = typeof fileBrowserErrorCodes[number]

export class FileBrowserError extends Error {
	readonly status: number
	readonly code: FileBrowserErrorCode
	readonly details?: unknown

	constructor(shape: FileBrowserErrorShape) {
		super(shape.message)
		this.name = 'FileBrowserError'
		this.status = shape.status
		this.code = shape.code
		this.details = shape.details
	}
}

export function fileBrowserErrorCodeFromStatus(status: number): FileBrowserErrorCode {
	switch (status) {
		case 400:
			return 'FILEBROWSER_BAD_REQUEST'
		case 401:
			return 'FILEBROWSER_UNAUTHORIZED'
		case 403:
			return 'FILEBROWSER_FORBIDDEN'
		case 404:
			return 'FILEBROWSER_NOT_FOUND'
		case 408:
			return 'FILEBROWSER_REQUEST_TIMEOUT'
		case 409:
			return 'FILE_CONFLICT'
		case 413:
			return 'FILEBROWSER_PAYLOAD_TOO_LARGE'
		case 500:
			return 'FILEBROWSER_SERVER_ERROR'
		case 502:
			return 'FILEBROWSER_BAD_GATEWAY'
		case 503:
			return 'FILEBROWSER_SERVICE_UNAVAILABLE'
		case 504:
			return 'FILEBROWSER_GATEWAY_TIMEOUT'
		default:
			return 'FILEBROWSER_REQUEST_FAILED'
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
		code: fileBrowserErrorCodeFromStatus(response.status),
		message,
	})
}
