import * as tus from 'tus-js-client'

import { FileBrowserError } from './errors'
import { normalizePath } from './path'

export const defaultTusThresholdBytes = 32 * 1024 * 1024
export const defaultTusChunkBytes = 8 * 1024 * 1024

export interface UploadProgress {
	readonly bytesUploaded: number
	readonly bytesTotal: number
}

export interface UploadOptions {
	readonly overwrite?: boolean
	readonly thresholdBytes?: number
	readonly chunkSizeBytes?: number
	readonly retryCount?: number
	readonly signal?: AbortSignal
	readonly onProgress?: (progress: UploadProgress) => void
}

export interface TusUploadOptions extends UploadOptions {
	readonly endpoint: string
	readonly token: string
	readonly file: Blob
	readonly path: string
}

export function shouldUseTus(file: Blob, thresholdBytes = defaultTusThresholdBytes): boolean {
	return file.size >= thresholdBytes
}

export function retryDelays(retryCount = 5): number[] {
	if (retryCount <= 0) {
		return []
	}
	const delays: number[] = []
	let delay = 0
	for (let index = 0; index < retryCount; index += 1) {
		delays.push(Math.min(delay, 20_000))
		delay = delay === 0 ? 1_000 : Math.min(delay * 2, 20_000)
	}
	return delays
}

export function uploadTus(options: TusUploadOptions): Promise<void> {
	const uploadPath = normalizePath(options.path)
	const endpoint = `${options.endpoint.replace(/\/$/, '')}/api/tus${uploadPath}?override=${options.overwrite === true}`
	return new Promise((resolve, reject) => {
		const upload = new tus.Upload(options.file, {
			endpoint,
			chunkSize: options.chunkSizeBytes ?? defaultTusChunkBytes,
			retryDelays: retryDelays(options.retryCount ?? 5),
			parallelUploads: 1,
			storeFingerprintForResuming: false,
			headers: {
				'Authorization': `Bearer ${options.token}`,
				'X-Auth': options.token,
			},
			onShouldRetry(error) {
				const status = error.originalResponse?.getStatus() ?? 0
				return status !== 409
			},
			onError(error) {
				const status = error instanceof tus.DetailedError
					? error.originalResponse?.getStatus() ?? 0
					: 0
				reject(new FileBrowserError({
					status,
					code: status === 409 ? 'FILE_CONFLICT' : 'TUS_UPLOAD_FAILED',
					message: error.message,
				}))
			},
			onProgress(bytesUploaded, bytesTotal) {
				options.onProgress?.({ bytesUploaded, bytesTotal })
			},
			onSuccess() {
				resolve()
			},
		})
		if (options.signal) {
			if (options.signal.aborted) {
				upload.abort(true)
				reject(new DOMException('Upload aborted', 'AbortError'))
				return
			}
			options.signal.addEventListener('abort', () => {
				upload.abort(true)
				reject(new DOMException('Upload aborted', 'AbortError'))
			}, { once: true })
		}
		upload.start()
	})
}
