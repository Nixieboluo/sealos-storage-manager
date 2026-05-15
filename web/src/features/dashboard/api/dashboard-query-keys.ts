export const dashboardKeys = {
	all: ['dashboard'] as const,
	status: () => [...dashboardKeys.all, 'status'] as const,
}
