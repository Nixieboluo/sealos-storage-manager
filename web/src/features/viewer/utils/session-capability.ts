import type { ViewerApiError } from '@/features/viewer/api/viewer-error'
import type { PVC, ViewerSession, ViewerToken } from '@/features/viewer/types/viewer'

export type ViewerFlowStatus = 'idle' | 'creating' | 'polling' | 'issuing-token' | 'ready' | 'failed'
export type ManualCloseKind = 'viewer' | 'pod'
export type SessionCapabilityKind
	= | 'none'
		| 'starting-pod'
		| 'pod-only'
		| 'viewer-ready'
		| 'viewer-reconnecting'
		| 'manual-closed'
		| 'failed'

export interface SessionCapabilityInput {
	error: ViewerApiError | null
	isReconnecting: boolean
	manualCloseKind: ManualCloseKind | null
	selectedPVC: PVC | null
	session: ViewerSession | null
	status: ViewerFlowStatus
	token: ViewerToken | null
}

export interface SessionCapability {
	canShowFileList: boolean
	canShowSessionNavigation: boolean
	canUseFiles: boolean
	error: ViewerApiError | null
	kind: SessionCapabilityKind
	manualCloseKind: ManualCloseKind | null
	messageKey: string
}

export function deriveSessionCapability({
	error,
	isReconnecting,
	manualCloseKind,
	selectedPVC,
	session,
	status,
	token,
}: SessionCapabilityInput): SessionCapability {
	if (!selectedPVC) {
		return capability('none', 'viewer.noSelection', false, false, false, error, manualCloseKind)
	}

	if (manualCloseKind) {
		return capability('manual-closed', 'files.manualClosed', manualCloseKind === 'viewer', false, false, error, manualCloseKind)
	}

	if (isReconnecting) {
		return capability('viewer-reconnecting', 'files.reconnecting', true, true, false, error, manualCloseKind)
	}

	if (token && session?.status === 'ready' && session.token_ready) {
		return capability('viewer-ready', 'files.ready', true, true, true, error, manualCloseKind)
	}

	if (status === 'failed') {
		return capability('failed', 'files.viewerUnavailable', true, false, false, error, manualCloseKind)
	}

	if (session) {
		return capability('pod-only', 'files.viewerPending', true, false, false, error, manualCloseKind)
	}

	if (status === 'creating' || status === 'polling' || status === 'issuing-token') {
		return capability('starting-pod', 'files.preparingViewer', true, false, false, error, manualCloseKind)
	}

	return capability('starting-pod', 'files.preparingViewer', true, false, false, error, manualCloseKind)
}

function capability(
	kind: SessionCapabilityKind,
	messageKey: string,
	canShowSessionNavigation: boolean,
	canShowFileList: boolean,
	canUseFiles: boolean,
	error: ViewerApiError | null,
	manualCloseKind: ManualCloseKind | null,
): SessionCapability {
	return {
		canShowFileList,
		canShowSessionNavigation,
		canUseFiles,
		error,
		kind,
		manualCloseKind,
		messageKey,
	}
}
