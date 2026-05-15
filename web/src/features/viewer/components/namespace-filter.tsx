import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { useViewerNamespace, useViewerSearch, viewerUIStore } from '@/features/viewer/stores/viewer-ui-store'

export function NamespaceFilter() {
	const namespace = useViewerNamespace()
	const search = useViewerSearch()
	const { t } = useTranslation()

	return (
		<div className="flex w-full flex-col gap-2 md:flex-row md:items-center md:justify-end">
			<div className="relative w-full md:w-80">
				<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					aria-label={t('common.search')}
					className="pl-9"
					onChange={event => viewerUIStore.actions.setSearch(event.target.value)}
					placeholder={t('viewer.searchPlaceholder')}
					value={search}
				/>
			</div>
			<div className="flex h-9 w-full items-center rounded-md border bg-muted px-3 text-sm md:w-48">
				<span className="truncate text-muted-foreground">
					{t('common.namespace')}
					:
					{' '}
				</span>
				<span className="truncate font-medium">{namespace || t('common.loading')}</span>
			</div>
		</div>
	)
}
