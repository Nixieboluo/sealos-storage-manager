import type { FileBrowserSession, RecycleEntry } from '@/features/file-manager/types/file-manager'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
	clearRecycleBinMutationOptions,
	restoreRecycleEntryMutationOptions,
} from '@/features/file-manager/api/file-manager-mutations'
import { recycleBinQueryOptions } from '@/features/file-manager/api/file-manager-query-options'
import { ClearRecycleBinDialog, RestoreRecycleEntryDialog } from '@/features/file-manager/components/recycle-bin-dialogs'
import { RecycleBinTable } from '@/features/file-manager/components/recycle-bin-table'

interface RecycleBinViewProps {
	session: FileBrowserSession | null
}

export function RecycleBinView({ session }: RecycleBinViewProps) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const recycleQuery = useQuery(recycleBinQueryOptions(session))
	const items = recycleQuery.data ?? []
	const [restoring, setRestoring] = useState<RecycleEntry | null>(null)
	const [clearing, setClearing] = useState(false)

	const restoreMutation = useMutation(restoreRecycleEntryMutationOptions(queryClient, session))
	const clearMutation = useMutation(clearRecycleBinMutationOptions(queryClient, session))

	const restoreEntry = (entry: RecycleEntry) => {
		restoreMutation.mutate(entry, {
			onSuccess: () => {
				toast.success(t('trash.restored'))
				setRestoring(null)
			},
			onError: error => toast.error(error instanceof Error ? error.message : t('errors.generic')),
		})
	}

	const clearRecycleBinEntries = () => {
		clearMutation.mutate(undefined, {
			onSuccess: () => {
				toast.success(t('trash.cleared'))
				setClearing(false)
			},
			onError: error => toast.error(error instanceof Error ? error.message : t('errors.generic')),
		})
	}

	return (
		<section className="flex min-h-0 flex-1 flex-col gap-4">
			<header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				<div>
					<h2 className="text-xl font-semibold">{t('trash.title')}</h2>
					<p className="text-sm text-muted-foreground">{t('trash.subtitle')}</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						aria-label={t('actions.refresh')}
						disabled={!session}
						onClick={() => void recycleQuery.refetch()}
						size="icon"
						variant="outline"
					>
						<RefreshCw />
					</Button>
					<Button
						disabled={!session || items.length === 0}
						onClick={() => setClearing(true)}
						size="sm"
						variant="destructive"
					>
						<Trash2 data-icon="inline-start" />
						{t('trash.clear')}
					</Button>
				</div>
			</header>
			<Separator />

			<RecycleBinTable
				isLoading={recycleQuery.isLoading}
				items={items}
				onRestore={setRestoring}
				sessionReady={session !== null}
			/>
			<RestoreRecycleEntryDialog
				entry={restoring}
				mutation={restoreMutation}
				onOpenChange={setRestoring}
				onRestore={restoreEntry}
			/>
			<ClearRecycleBinDialog
				mutation={clearMutation}
				onClear={clearRecycleBinEntries}
				onOpenChange={setClearing}
				open={clearing}
			/>
		</section>
	)
}
