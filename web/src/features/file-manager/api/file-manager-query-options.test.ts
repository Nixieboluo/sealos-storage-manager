import type { FileBrowserSession } from '@/features/file-manager/types/file-manager'

import { describe, expect, it, vi } from 'vitest'
import { fileUsageQueryOptions } from '@/features/file-manager/api/file-manager-query-options'

describe('fileManagerQueryOptions', () => {
	it('does not retry mounted storage usage failures', () => {
		const session = {
			client: {
				usage: vi.fn(),
			},
			pvcKey: 'pvc-1',
		} as unknown as FileBrowserSession

		const options = fileUsageQueryOptions(session)

		expect(options.retry).toBe(false)
	})
})
