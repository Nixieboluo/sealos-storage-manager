import type { ViewerAPI } from '@/features/viewer/types/viewer'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { viewerApi } from '@/features/viewer/api/viewer-api'
import { heartbeatViewerSessionMutationOptions } from '@/features/viewer/api/viewer-mutations'

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
	const queryClient = useQueryClient()
	const heartbeat = useMutation(heartbeatViewerSessionMutationOptions(queryClient, api))
	const heartbeatViewerSessionRef = useRef(heartbeat.mutateAsync)
	const onErrorRef = useRef(onError)

	useEffect(() => {
		heartbeatViewerSessionRef.current = heartbeat.mutateAsync
		onErrorRef.current = onError
	}, [heartbeat.mutateAsync, onError])

	useEffect(() => {
		if (!enabled || !viewerSessionID) {
			return undefined
		}

		let cancelled = false
		const sendHeartbeat = () => {
			void heartbeatViewerSessionRef.current(viewerSessionID).catch((error: unknown) => {
				if (!cancelled) {
					onErrorRef.current?.(error)
				}
			})
		}

		sendHeartbeat()
		const id = window.setInterval(sendHeartbeat, intervalMs)
		return () => {
			cancelled = true
			window.clearInterval(id)
		}
	}, [enabled, intervalMs, viewerSessionID])
}
