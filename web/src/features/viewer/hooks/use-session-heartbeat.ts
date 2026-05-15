import type { ViewerAPI } from '@/features/viewer/types/viewer'

import { useEffect } from 'react'

import { viewerApi } from '@/features/viewer/api/viewer-api'

interface UseSessionHeartbeatInput {
	api?: ViewerAPI
	enabled: boolean
	intervalMs?: number
	onError?: (error: unknown) => void
	viewerSessionID: string | null
}

export function useSessionHeartbeat({
	api = viewerApi,
	enabled,
	intervalMs = 20_000,
	onError,
	viewerSessionID,
}: UseSessionHeartbeatInput) {
	useEffect(() => {
		if (!enabled || !viewerSessionID) {
			return undefined
		}

		let cancelled = false
		const sendHeartbeat = () => {
			void api.heartbeatViewerSession(viewerSessionID).catch((error: unknown) => {
				if (!cancelled) {
					onError?.(error)
				}
			})
		}

		sendHeartbeat()
		const id = window.setInterval(sendHeartbeat, intervalMs)
		return () => {
			cancelled = true
			window.clearInterval(id)
		}
	}, [api, enabled, intervalMs, onError, viewerSessionID])
}
