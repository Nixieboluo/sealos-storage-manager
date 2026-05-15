import type { ViewerSession } from '@/features/viewer/types/viewer'

import { Clock3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ViewerSessionStatusBadge } from '@/features/viewer/components/pvc-status-badge'

interface SessionLifecycleBannerProps {
	session: ViewerSession | null
}

export function SessionLifecycleBanner({ session }: SessionLifecycleBannerProps) {
	const { t } = useTranslation()

	if (!session) {
		return (
			<Alert>
				<AlertTitle className="flex items-center gap-2">
					<Clock3 className="size-4" />
					{t('viewer.sessionLifecycle')}
				</AlertTitle>
				<AlertDescription>{t('viewer.noSelection')}</AlertDescription>
			</Alert>
		)
	}

	return (
		<Alert>
			<AlertTitle className="flex items-center gap-2">
				<Clock3 className="size-4" />
				{t('viewer.activeSession')}
				<ViewerSessionStatusBadge session={session} />
			</AlertTitle>
			<AlertDescription className="grid gap-1">
				<span>
					{t('viewer.podSession')}
					{': '}
					{session.pod_session_id}
					{' · '}
					{t('status.label')}
					{': '}
					{session.pod_status}
				</span>
				<span>
					{t('viewer.viewerUrl')}
					{': '}
					{session.viewer_url || '-'}
				</span>
				<span>
					{t('viewer.viewerMode')}
					{': '}
					{session.mode}
					{' · '}
					{t('viewer.lastHeartbeat')}
					{': '}
					{session.last_heartbeat_at || '-'}
				</span>
				{session.reason
					? (
							<span>
								{t('viewer.scheduling')}
								{': '}
								{session.reason}
							</span>
						)
					: null}
			</AlertDescription>
		</Alert>
	)
}
