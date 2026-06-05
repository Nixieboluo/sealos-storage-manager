import type { ViewerAPI, ViewerSession } from '@/features/viewer/types/viewer'
import type { ManualCloseKind, SessionCapability } from '@/features/viewer/utils/session-capability'

import { Info, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from '@/components/ui/popover'
import { translateViewerError } from '@/features/viewer/api/viewer-error'
import { SessionActions } from '@/features/viewer/components/session-actions'
import { cn } from '@/utils/cn'

interface SessionStatusPopoverProps {
	api: ViewerAPI
	onRefreshSession: () => void
	onManualClose?: (kind: ManualCloseKind) => void
	podSessionID: string | null
	session: ViewerSession | null
	sessionCapability: SessionCapability
	viewerSessionID: string | null
}

export function SessionStatusPopover({
	api,
	onManualClose,
	onRefreshSession,
	podSessionID,
	session,
	sessionCapability,
	viewerSessionID,
}: SessionStatusPopoverProps) {
	const { t } = useTranslation()
	const statusClassName = sessionStatusDotClassName(sessionCapability.kind)
	const canRetry = sessionCapability.kind !== 'viewer-ready'

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button aria-label={t('files.sessionStatus')} title={t('files.sessionStatus')} size="icon" variant="ghost">
					<span className={cn('block size-2.5 rounded-full', statusClassName)} />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-[min(calc(100vw-2rem),30rem)]">
				<PopoverHeader>
					<PopoverTitle className="flex items-center gap-2">
						<span className={cn('block size-2.5 rounded-full', statusClassName)} />
						{t('files.sessionStatus')}
					</PopoverTitle>
					<PopoverDescription>
						{t(sessionCapability.messageKey)}
					</PopoverDescription>
				</PopoverHeader>
				<div className="mt-4 flex flex-col gap-3 text-sm">
					<SessionDetailRow label={t('status.label')} value={session ? t(`status.${session.status}`, { defaultValue: session.status }) : t('status.idle')} />
					<SessionDetailRow label={t('viewer.podSession')} value={session?.pod_session_id ?? podSessionID ?? '-'} />
					<SessionDetailRow label={t('viewer.podStatus')} value={session?.pod_status ?? '-'} />
					<SessionDetailRow label={t('viewer.viewerUrl')} value={session?.viewer_url || '-'} />
					<SessionDetailRow label={t('viewer.viewerMode')} value={session?.mode ?? '-'} />
					<SessionDetailRow label={t('viewer.lastHeartbeat')} value={session?.last_heartbeat_at || '-'} />
					{session?.reason
						? <SessionDetailRow label={t('viewer.scheduling')} value={session.reason} />
						: null}
					{sessionCapability.error
						? (
								<div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">
									{translateViewerError(sessionCapability.error, t)}
								</div>
							)
						: null}
					<div className="flex flex-wrap items-center gap-2 pt-1">
						{canRetry
							? (
									<Button onClick={onRefreshSession} size="sm" variant="outline">
										<RefreshCw data-icon="inline-start" />
										{t('actions.retry')}
									</Button>
								)
							: null}
						<SessionActions
							api={api}
							canDiscardLocalState={sessionCapability.kind === 'failed' || sessionCapability.kind === 'manual-closed'}
							onManualClose={onManualClose}
							podSessionID={podSessionID}
							showPodAction={false}
							viewerSessionID={viewerSessionID}
						/>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	)
}

interface SessionDetailRowProps {
	label: string
	value: string
}

function SessionDetailRow({ label, value }: SessionDetailRowProps) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs text-muted-foreground">{label}</span>
			<span className="min-w-0 break-words font-mono text-xs text-foreground">{value}</span>
		</div>
	)
}

interface FileListErrorStateProps {
	api: ViewerAPI
	error: Error
	onManualClose?: (kind: ManualCloseKind) => void
	onRetry: () => void
	podSessionID: string | null
	sessionCapability: SessionCapability
	viewerSessionID: string | null
}

export function FileListErrorState({
	api,
	error,
	onManualClose,
	onRetry,
	podSessionID,
	sessionCapability,
	viewerSessionID,
}: FileListErrorStateProps) {
	const { t } = useTranslation()

	return (
		<div className="mx-auto flex max-w-lg flex-col items-center gap-4 text-center">
			<div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
				<Info />
			</div>
			<div className="flex flex-col gap-1">
				<div className="font-medium text-foreground">{t('files.fileListUnavailable')}</div>
				<div className="text-sm text-muted-foreground">{t(sessionCapability.messageKey)}</div>
				<div className="text-sm text-destructive">
					{error instanceof Error ? error.message : t('errors.generic')}
				</div>
			</div>
			<div className="flex flex-wrap justify-center gap-2">
				<Button onClick={onRetry} size="sm" variant="outline">
					<RefreshCw data-icon="inline-start" />
					{t('actions.retry')}
				</Button>
				<SessionActions
					api={api}
					onManualClose={onManualClose}
					podSessionID={podSessionID}
					showPodAction={false}
					viewerSessionID={viewerSessionID}
				/>
			</div>
		</div>
	)
}

function sessionStatusDotClassName(kind: SessionCapability['kind']) {
	if (kind === 'viewer-ready') {
		return 'bg-emerald-500'
	}
	if (kind === 'failed') {
		return 'bg-destructive'
	}
	if (kind === 'starting-pod' || kind === 'pod-only' || kind === 'viewer-reconnecting') {
		return 'bg-amber-500'
	}
	return 'bg-muted-foreground'
}
