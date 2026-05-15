export const env = {
	apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
	appName: import.meta.env.VITE_APP_NAME ?? 'Sealos Storage Manager',
	fileUploadTusChunkBytes: parsePositiveInteger(
		import.meta.env.VITE_FILE_UPLOAD_TUS_CHUNK_BYTES,
		8 * 1024 * 1024,
	),
	fileUploadTusRetryCount: parsePositiveInteger(
		import.meta.env.VITE_FILE_UPLOAD_TUS_RETRY_COUNT,
		5,
	),
	fileUploadTusThresholdBytes: parsePositiveInteger(
		import.meta.env.VITE_FILE_UPLOAD_TUS_THRESHOLD_BYTES,
		32 * 1024 * 1024,
	),
} as const

function parsePositiveInteger(value: string | undefined, fallback: number) {
	if (!value) {
		return fallback
	}
	const parsed = Number.parseInt(value, 10)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
