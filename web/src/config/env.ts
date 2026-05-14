export const env = {
	apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
	appName: import.meta.env.VITE_APP_NAME ?? 'Sealos Storage Manager',
} as const
