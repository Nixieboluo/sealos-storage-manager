import type { ViewerAPI } from '@/features/viewer/types/viewer'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { hasActiveUploadsForSession } from '@/features/file-manager/stores/upload-store'
import { viewerApi } from '@/features/viewer/api/viewer-api'
import { closeViewerSessionMutationOptions } from '@/features/viewer/api/viewer-mutations'

interface UseBeforeUnloadCloseSessionInput {
	api?: ViewerAPI
	enabled: boolean
	hasActiveUpload?: boolean
	viewerSessionID: string | null
}

export function useBeforeUnloadCloseSession({
	api = viewerApi,
	enabled,
	hasActiveUpload = false,
	viewerSessionID,
}: UseBeforeUnloadCloseSessionInput) {
	const queryClient = useQueryClient()
	const closeViewerSession = useMutation(closeViewerSessionMutationOptions(queryClient, api))
	const closeViewerSessionRef = useRef(closeViewerSession.mutateAsync)

	useEffect(() => {
		closeViewerSessionRef.current = closeViewerSession.mutateAsync
	}, [closeViewerSession.mutateAsync])

	useEffect(() => {
		if (!enabled || !viewerSessionID) {
			return undefined
		}

		const closeSession = () => {
			if (hasActiveUploadsForSession({ viewerSessionID })) {
				return
			}
			void closeViewerSessionRef.current(viewerSessionID).catch(() => undefined)
		}
		const warnBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!hasActiveUploadsForSession({ viewerSessionID })) {
				return
			}
			event.preventDefault()
			event.returnValue = ''
		}

		window.addEventListener('pagehide', closeSession)
		window.addEventListener('beforeunload', warnBeforeUnload)
		return () => {
			window.removeEventListener('pagehide', closeSession)
			window.removeEventListener('beforeunload', warnBeforeUnload)
		}
	}, [enabled, hasActiveUpload, viewerSessionID])
}
