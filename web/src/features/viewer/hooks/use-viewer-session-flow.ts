import type { ViewerApiError } from '@/features/viewer/api/viewer-error'
import type { ViewerAPI, ViewerSelection, ViewerSession, ViewerToken } from '@/features/viewer/types/viewer'
import type { ManualCloseKind } from '@/features/viewer/utils/session-capability'

import { startTransition, useCallback, useEffect, useRef, useState } from 'react'

import { viewerApi } from '@/features/viewer/api/viewer-api'
import { normalizeViewerError } from '@/features/viewer/api/viewer-error'

type FlowStatus = 'idle' | 'creating' | 'polling' | 'issuing-token' | 'ready' | 'failed'

interface UseViewerSessionFlowInput {
	api?: ViewerAPI
	pollIntervalMs?: number
}

export interface ViewerSessionFlow {
	error: ViewerApiError | null
	isManualClosed: boolean
	isReconnecting: boolean
	manualCloseKind: ManualCloseKind | null
	recover: (error?: unknown) => Promise<void>
	registerManualClose: (kind: ManualCloseKind) => void
	reset: () => void
	session: ViewerSession | null
	start: (pvc: ViewerSelection) => Promise<void>
	status: FlowStatus
	token: ViewerToken | null
}

function shouldPoll(session: ViewerSession) {
	return session.status === 'creating' || session.status === 'active'
}

export function useViewerSessionFlow({
	api = viewerApi,
	pollIntervalMs = 2_000,
}: UseViewerSessionFlowInput = {}): ViewerSessionFlow {
	const [error, setError] = useState<ReturnType<typeof normalizeViewerError> | null>(null)
	const [selectedPVC, setSelectedPVC] = useState<ViewerSelection | null>(null)
	const [session, setSession] = useState<ViewerSession | null>(null)
	const [status, setStatus] = useState<FlowStatus>('idle')
	const [token, setToken] = useState<ViewerToken | null>(null)
	const [manualCloseKind, setManualCloseKind] = useState<ManualCloseKind | null>(null)
	const [isReconnecting, setIsReconnecting] = useState(false)
	const issuingTokenRef = useRef(false)

	const createForPVC = useCallback(async (pvc: ViewerSelection) => {
		setStatus('creating')
		setError(null)
		setIsReconnecting(false)
		setManualCloseKind(null)
		setToken(null)
		const nextSession = await api.createViewerSession({
			namespace: pvc.namespace,
			pvcName: pvc.pvcName,
		})
		setSession(nextSession)
		setStatus(nextSession.status === 'ready' ? 'issuing-token' : 'polling')
	}, [api])

	const start = useCallback(async (pvc: ViewerSelection) => {
		setSelectedPVC(pvc)
		setManualCloseKind(null)
		setIsReconnecting(false)
		try {
			await createForPVC(pvc)
		}
		catch (caught) {
			setError(normalizeViewerError(caught))
			setStatus('failed')
		}
	}, [createForPVC])

	const reset = useCallback(() => {
		setError(null)
		setIsReconnecting(false)
		setManualCloseKind(null)
		setSelectedPVC(null)
		setSession(null)
		setStatus('idle')
		setToken(null)
		issuingTokenRef.current = false
	}, [])

	const registerManualClose = useCallback((kind: ManualCloseKind) => {
		setManualCloseKind(kind)
		setIsReconnecting(false)
		setError(null)
		if (kind === 'pod') {
			setSelectedPVC(null)
			setSession(null)
		}
		else if (session) {
			setSession({ ...session, status: 'closed' })
		}
		setStatus('idle')
		setToken(null)
		issuingTokenRef.current = false
	}, [session])

	const recover = useCallback(async (caught?: unknown) => {
		if (!selectedPVC || manualCloseKind) {
			return
		}
		if (caught) {
			setError(normalizeViewerError(caught))
		}
		setIsReconnecting(true)
		setToken(null)
		issuingTokenRef.current = false
		try {
			await createForPVC(selectedPVC)
		}
		catch (createError) {
			setError(normalizeViewerError(createError))
			setStatus('failed')
		}
		finally {
			setIsReconnecting(false)
		}
	}, [createForPVC, manualCloseKind, selectedPVC])

	useEffect(() => {
		if (!session || !shouldPoll(session)) {
			return undefined
		}

		const id = window.setInterval(() => {
			void api.getViewerSession(session.id)
				.then((nextSession) => {
					setSession(nextSession)
					if (nextSession.status === 'ready') {
						setStatus('issuing-token')
					}
					else if (nextSession.status === 'failed' || nextSession.status === 'expired' || nextSession.status === 'closed') {
						setStatus('failed')
					}
				})
				.catch(async (caught) => {
					const nextError = normalizeViewerError(caught)
					if (nextError.code === 'VIEWER_SESSION_NOT_FOUND' && selectedPVC) {
						try {
							await recover(nextError)
						}
						catch (createError) {
							setError(normalizeViewerError(createError))
							setStatus('failed')
						}
						return
					}
					setError(nextError)
					setStatus('failed')
				})
		}, pollIntervalMs)

		return () => window.clearInterval(id)
	}, [api, pollIntervalMs, recover, selectedPVC, session])

	useEffect(() => {
		if (!session || session.status !== 'ready' || !session.token_ready || issuingTokenRef.current || token) {
			return
		}
		issuingTokenRef.current = true
		startTransition(() => setStatus('issuing-token'))
		void api.issueViewerToken(session.id)
			.then((nextToken) => {
				setToken(nextToken)
				setIsReconnecting(false)
				setStatus('ready')
			})
			.catch((caught) => {
				setError(normalizeViewerError(caught))
				setStatus('failed')
			})
			.finally(() => {
				issuingTokenRef.current = false
			})
	}, [api, session, token])

	return {
		error,
		isManualClosed: manualCloseKind !== null,
		isReconnecting,
		manualCloseKind,
		recover,
		registerManualClose,
		reset,
		session,
		start,
		status,
		token,
	}
}
