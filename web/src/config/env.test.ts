import { afterEach, describe, expect, it, vi } from 'vitest'

describe('frontend environment parsing', () => {
	afterEach(() => {
		vi.resetModules()
		vi.unstubAllEnvs()
	})

	it('uses TUS upload defaults when env vars are absent', async () => {
		const { env } = await import('@/config/env')

		expect(env.fileUploadTusThresholdBytes).toBe(32 * 1024 * 1024)
		expect(env.fileUploadTusChunkBytes).toBe(8 * 1024 * 1024)
		expect(env.fileUploadTusRetryCount).toBe(5)
	})

	it('parses positive TUS upload env overrides', async () => {
		vi.stubEnv('VITE_FILE_UPLOAD_TUS_THRESHOLD_BYTES', '1024')
		vi.stubEnv('VITE_FILE_UPLOAD_TUS_CHUNK_BYTES', '512')
		vi.stubEnv('VITE_FILE_UPLOAD_TUS_RETRY_COUNT', '2')

		const { env } = await import('@/config/env')

		expect(env.fileUploadTusThresholdBytes).toBe(1024)
		expect(env.fileUploadTusChunkBytes).toBe(512)
		expect(env.fileUploadTusRetryCount).toBe(2)
	})
})
