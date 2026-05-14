import type { DashboardStatus } from '@/features/dashboard/types/dashboard'

import { queryOptions } from '@tanstack/react-query'

export const dashboardStatusQuery = queryOptions({
	queryKey: ['dashboard', 'status'],
	queryFn: async (): Promise<DashboardStatus> => ({
		service: 'viewer',
		api: 'Encore generated SDK',
		compatibility: 'Chrome 86 polyfill build',
	}),
	staleTime: 60_000,
})
