import type { FileBrowserSession, RecycleEntry } from '@/features/file-manager/types/file-manager'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import {
	clearRecycleBinMutationOptions,
	restoreRecycleEntryMutationOptions,
} from '@/features/file-manager/api/file-manager-mutations'
import { recycleBinQueryOptions } from '@/features/file-manager/api/file-manager-query-options'
import { remainingTrashDays } from '@/features/file-manager/utils/file-tree'
import { formatBytes } from '@/features/viewer/utils/format-capacity'

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

			<div className="rounded-lg border bg-card">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t('trash.columns.name')}</TableHead>
							<TableHead>{t('trash.columns.originalPath')}</TableHead>
							<TableHead>{t('trash.columns.size')}</TableHead>
							<TableHead>{t('trash.columns.deletedAt')}</TableHead>
							<TableHead>{t('trash.columns.remainingDays')}</TableHead>
							<TableHead className="text-right">{t('files.columns.actions')}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{!session || recycleQuery.isLoading
							? (
									<TableRow>
										<TableCell className="py-12 text-center text-muted-foreground" colSpan={6}>
											{session ? t('common.loading') : t('files.preparingViewer')}
										</TableCell>
									</TableRow>
								)
							: null}
						{session && !recycleQuery.isLoading
							? items.map(item => (
									<TableRow key={item.id}>
										<TableCell className="font-medium">{item.name}</TableCell>
										<TableCell className="font-mono text-xs text-muted-foreground">{item.originalPath}</TableCell>
										<TableCell>{formatBytes(item.size)}</TableCell>
										<TableCell>{item.deletedAt}</TableCell>
										<TableCell>{remainingTrashDays(item.deletedAt)}</TableCell>
										<TableCell className="text-right">
											<Button onClick={() => setRestoring(item)} size="sm" variant="outline">
												<RotateCcw data-icon="inline-start" />
												{t('trash.restore')}
											</Button>
										</TableCell>
									</TableRow>
								))
							: null}
						{session && !recycleQuery.isLoading && items.length === 0
							? (
									<TableRow>
										<TableCell className="py-12 text-center text-muted-foreground" colSpan={6}>
											{t('trash.empty')}
										</TableCell>
									</TableRow>
								)
							: null}
					</TableBody>
				</Table>
			</div>

			<Dialog onOpenChange={open => !open && setRestoring(null)} open={restoring !== null}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('trash.confirmRestoreTitle')}</DialogTitle>
						<DialogDescription>
							{restoring ? t('trash.confirmRestoreDescription', { name: restoring.name }) : ''}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button onClick={() => setRestoring(null)} variant="outline">
							{t('actions.cancel')}
						</Button>
						<Button
							disabled={restoreMutation.isPending || !restoring}
							onClick={() => restoring && restoreEntry(restoring)}
						>
							{t('trash.restore')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog onOpenChange={setClearing} open={clearing}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('trash.confirmClearTitle')}</DialogTitle>
						<DialogDescription>{t('trash.confirmClearDescription')}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button onClick={() => setClearing(false)} variant="outline">
							{t('actions.cancel')}
						</Button>
						<Button
							disabled={clearMutation.isPending}
							onClick={clearRecycleBinEntries}
							variant="destructive"
						>
							{t('trash.clear')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</section>
	)
}
