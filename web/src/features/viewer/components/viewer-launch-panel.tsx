import type { ViewerSessionFlow } from '@/features/viewer/hooks/use-viewer-session-flow'
import type { PVC, ViewerAPI, ViewerToken } from '@/features/viewer/types/viewer'

import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { viewerApi } from '@/features/viewer/api/viewer-api'
import { translateViewerError } from '@/features/viewer/api/viewer-error'
import { ErrorCallout } from '@/features/viewer/components/error-callout'
import { SessionActions } from '@/features/viewer/components/session-actions'
import { SessionLifecycleBanner } from '@/features/viewer/components/session-lifecycle-banner'
import { useBeforeUnloadCloseSession } from '@/features/viewer/hooks/use-before-unload-close-session'
import { useSessionHeartbeat } from '@/features/viewer/hooks/use-session-heartbeat'
import { useViewerSessionFlow } from '@/features/viewer/hooks/use-viewer-session-flow'
import { viewerUIStore } from '@/features/viewer/stores/viewer-ui-store'
import { pvcIdentity } from '@/features/viewer/utils/viewer-status'

export interface ViewerFlowSnapshot {
	error: ViewerSessionFlow['error']
	isReconnecting: ViewerSessionFlow['isReconnecting']
	manualCloseKind: ViewerSessionFlow['manualCloseKind']
	recover: ViewerSessionFlow['recover']
	session: ViewerSessionFlow['session']
	status: ViewerSessionFlow['status']
}

interface ViewerLaunchPanelProps {
	api?: ViewerAPI
	autoStartKey?: string | null
	onFlowChange?: (flow: ViewerFlowSnapshot) => void
	onSessionStatusChange?: (status: string) => void
	pvc: PVC | null
	setToken: (token: ViewerToken | null) => void
}

export function ViewerLaunchPanel({
	api = viewerApi,
	autoStartKey,
	onFlowChange,
	onSessionStatusChange,
	pvc,
	setToken,
}: ViewerLaunchPanelProps) {
	const { t } = useTranslation()
	const flow = useViewerSessionFlow({ api })
	const active = flow.status === 'ready'
	const startFlow = flow.start
	const recoverFlow = flow.recover

	useSessionHeartbeat({
		api,
		enabled: active,
		onError: error => void recoverFlow(error),
		viewerSessionID: flow.session?.id ?? null,
	})
	useBeforeUnloadCloseSession({
		api,
		enabled: Boolean(flow.session?.id),
		viewerSessionID: flow.session?.id ?? null,
	})

	useEffect(() => {
		if (flow.session) {
			viewerUIStore.actions.setActiveSession(flow.session.id, flow.session.pod_session_id)
		}
	}, [flow.session])

	useEffect(() => {
		setToken(flow.token)
	}, [flow.token, setToken])

	useEffect(() => {
		onSessionStatusChange?.(flow.status)
	}, [flow.status, onSessionStatusChange])

	useEffect(() => {
		onFlowChange?.({
			error: flow.error,
			isReconnecting: flow.isReconnecting,
			manualCloseKind: flow.manualCloseKind,
			recover: flow.recover,
			session: flow.session,
			status: flow.status,
		})
	}, [
		flow.error,
		flow.isReconnecting,
		flow.manualCloseKind,
		flow.recover,
		flow.session,
		flow.status,
		onFlowChange,
	])

	useEffect(() => {
		if (!pvc || !autoStartKey) {
			return
		}
		void startFlow(pvcIdentity(pvc))
	}, [autoStartKey, startFlow, pvc])

	return (
		<Card className="rounded-lg">
			<CardHeader>
				<CardTitle>{t('viewer.sessionLifecycle')}</CardTitle>
				<CardDescription>
					{pvc ? `${pvc.namespace}/${pvc.name}` : t('viewer.noSelection')}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<SessionLifecycleBanner session={flow.session} />
				{flow.error
					? (
							<ErrorCallout title={t('common.error')}>
								{translateViewerError(flow.error, t)}
							</ErrorCallout>
						)
					: null}
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<Button
						disabled={!pvc || flow.status === 'creating' || flow.status === 'polling' || flow.status === 'issuing-token'}
						onClick={() => {
							if (!pvc) {
								return
							}
							void flow.start(pvcIdentity(pvc))
						}}
					>
						{flow.status === 'creating' || flow.status === 'polling' || flow.status === 'issuing-token'
							? t('common.loading')
							: t('actions.launchViewer')}
					</Button>
					<SessionActions
						api={api}
						onManualClose={flow.registerManualClose}
						podSessionID={flow.session?.pod_session_id ?? null}
						viewerSessionID={flow.session?.id ?? null}
					/>
				</div>
			</CardContent>
		</Card>
	)
}
