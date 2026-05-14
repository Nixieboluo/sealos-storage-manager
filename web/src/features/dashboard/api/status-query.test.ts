import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { dashboardStatusQuery } from '@/features/dashboard/api/status-query'

describe('dashboardStatusQuery', () => {
	it('returns scaffold status metadata', async () => {
		const queryClient = new QueryClient()

		await expect(queryClient.fetchQuery(dashboardStatusQuery)).resolves.toEqual({
			api: 'Encore generated SDK',
			compatibility: 'Chrome 86 polyfill build',
			service: 'viewer',
		})
	})
})
