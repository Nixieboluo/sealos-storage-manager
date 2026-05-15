import type { DashboardStatus } from '@/features/dashboard/types/dashboard'

import { queryOptions } from '@tanstack/react-query'

import { dashboardKeys } from '@/features/dashboard/api/dashboard-query-keys'

export const dashboardStatusQuery = queryOptions({
	queryKey: dashboardKeys.status(),
	queryFn: async (): Promise<DashboardStatus> => ({
		service: 'viewer',
		api: 'Encore generated SDK',
		compatibility: 'Chrome 86 polyfill build',
	}),
	staleTime: 60_000,
})
