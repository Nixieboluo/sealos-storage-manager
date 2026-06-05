import type { ReactNode } from 'react'
import type { ViewerView } from '@/features/viewer/stores/viewer-ui-store'

import { Button } from '@/components/ui/button'
import { viewerUIStore } from '@/features/viewer/stores/viewer-ui-store'

interface SidebarButtonProps {
	icon: ReactNode
	label: string
	value: ViewerView
	view: ViewerView
}

export function SidebarButton({ icon, label, value, view }: SidebarButtonProps) {
	return (
		<Button
			className="justify-start"
			onClick={() => viewerUIStore.actions.setView(value)}
			variant={view === value ? 'secondary' : 'ghost'}
		>
			<span className="[&_svg]:size-4">{icon}</span>
			{label}
		</Button>
	)
}
