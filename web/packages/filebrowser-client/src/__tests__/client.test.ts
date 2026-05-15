import { describe, expect, it, vi } from 'vitest'

import { FileBrowserClient } from '../client'

describe('fileBrowserClient', () => {
	it('calls typed File Browser resource APIs with auth headers', async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			path: '/',
			name: '',
			size: 0,
			modified: '',
			isDir: true,
			items: [],
		})))
		const client = new FileBrowserClient({
			baseUrl: 'https://viewer.example.test/',
			token: 'token',
			fetcher,
		})

		await expect(client.list('/docs')).resolves.toMatchObject({ path: '/' })

		expect(fetcher).toHaveBeenCalledWith('https://viewer.example.test/api/resources/docs', expect.objectContaining({
			method: 'GET',
			headers: expect.objectContaining({
				'Authorization': 'Bearer token',
				'X-Auth': 'token',
			}),
		}))
	})

	it('uses simple upload below the TUS threshold', async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
		const client = new FileBrowserClient({
			baseUrl: 'https://viewer.example.test',
			token: 'token',
			fetcher,
		})
		const onProgress = vi.fn()
		const file = new File(['small'], 'small.txt')

		await client.uploadFile('/', file, {
			thresholdBytes: 32 * 1024 * 1024,
			onProgress,
		})

		expect(fetcher).toHaveBeenCalledWith(
			'https://viewer.example.test/api/resources/small.txt?override=false',
			expect.objectContaining({ method: 'POST', body: file }),
		)
		expect(onProgress).toHaveBeenCalledWith({
			bytesUploaded: file.size,
			bytesTotal: file.size,
		})
	})

	it('normalizes conflict errors from File Browser responses', async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			message: 'already exists',
		}), { status: 409 }))
		const client = new FileBrowserClient({
			baseUrl: 'https://viewer.example.test',
			token: 'token',
			fetcher,
		})

		await expect(client.createFolder('/docs')).rejects.toMatchObject({
			code: 'FILE_CONFLICT',
			status: 409,
		})
	})
})
