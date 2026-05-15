import { beforeEach, describe, expect, it, vi } from 'vitest'

import { retryDelays, shouldUseTus, uploadTus } from '../upload'

const tusState = vi.hoisted(() => ({
	options: undefined as Record<string, unknown> | undefined,
	abort: vi.fn(),
	start: vi.fn(),
}))

vi.mock('tus-js-client', () => {
	class DetailedError extends Error {
		originalResponse?: { getStatus: () => number }
	}

	class Upload {
		constructor(_file: Blob, options: Record<string, unknown>) {
			tusState.options = options
		}

		abort(shouldTerminate: boolean) {
			tusState.abort(shouldTerminate)
		}

		start() {
			tusState.start()
			const options = tusState.options as {
				onProgress?: (bytesUploaded: number, bytesTotal: number) => void
				onSuccess?: () => void
			}
			options.onProgress?.(4, 8)
			options.onSuccess?.()
		}
	}

	return { DetailedError, Upload }
})

describe('tUS upload policy', () => {
	beforeEach(() => {
		tusState.options = undefined
		tusState.abort.mockClear()
		tusState.start.mockClear()
	})

	it('uses TUS at and above the large-file threshold', () => {
		expect(shouldUseTus(new Blob(['1234']), 4)).toBe(true)
		expect(shouldUseTus(new Blob(['123']), 4)).toBe(false)
	})

	it('creates exponential retry delays with an immediate first retry', () => {
		expect(retryDelays(5)).toEqual([0, 1000, 2000, 4000, 8000])
		expect(retryDelays(0)).toEqual([])
	})

	it('configures File Browser TUS uploads without persistent resume fingerprints', async () => {
		const onProgress = vi.fn()

		await uploadTus({
			endpoint: 'https://viewer.example.test/',
			token: 'token',
			file: new Blob(['payload']),
			path: '/data.bin',
			overwrite: true,
			chunkSizeBytes: 8,
			retryCount: 2,
			onProgress,
		})

		expect(tusState.start).toHaveBeenCalled()
		expect(tusState.options).toMatchObject({
			endpoint: 'https://viewer.example.test/api/tus/data.bin?override=true',
			chunkSize: 8,
			retryDelays: [0, 1000],
			parallelUploads: 1,
			storeFingerprintForResuming: false,
			headers: {
				'Authorization': 'Bearer token',
				'X-Auth': 'token',
			},
		})
		expect(onProgress).toHaveBeenCalledWith({ bytesUploaded: 4, bytesTotal: 8 })
	})

	it('does not retry File Browser conflict responses', async () => {
		await uploadTus({
			endpoint: 'https://viewer.example.test',
			token: 'token',
			file: new Blob(['payload']),
			path: '/data.bin',
		})

		const shouldRetry = tusState.options?.onShouldRetry as (error: {
			originalResponse?: { getStatus: () => number }
		}) => boolean

		expect(shouldRetry({ originalResponse: { getStatus: () => 409 } })).toBe(false)
		expect(shouldRetry({ originalResponse: { getStatus: () => 500 } })).toBe(true)
	})
})
