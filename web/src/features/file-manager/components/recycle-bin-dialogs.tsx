import type { UseMutationResult } from '@tanstack/react-query'
import type { RecycleEntry } from '@/features/file-manager/types/file-manager'

import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'

interface RestoreRecycleEntryDialogProps {
	entry: RecycleEntry | null
	mutation: UseMutationResult<RecycleEntry, Error, RecycleEntry>
	onOpenChange: (entry: RecycleEntry | null) => void
	onRestore: (entry: RecycleEntry) => void
}

export function RestoreRecycleEntryDialog({ entry, mutation, onOpenChange, onRestore }: RestoreRecycleEntryDialogProps) {
	const { t } = useTranslation()

	return (
		<Dialog onOpenChange={open => !open && onOpenChange(null)} open={entry !== null}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t('trash.confirmRestoreTitle')}</DialogTitle>
					<DialogDescription>
						{entry ? t('trash.confirmRestoreDescription', { name: entry.name }) : ''}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button onClick={() => onOpenChange(null)} variant="outline">
						{t('actions.cancel')}
					</Button>
					<Button disabled={mutation.isPending || !entry} onClick={() => entry && onRestore(entry)}>
						{t('trash.restore')}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

interface ClearRecycleBinDialogProps {
	mutation: UseMutationResult<void, Error, void>
	onClear: () => void
	onOpenChange: (open: boolean) => void
	open: boolean
}

export function ClearRecycleBinDialog({ mutation, onClear, onOpenChange, open }: ClearRecycleBinDialogProps) {
	const { t } = useTranslation()

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t('trash.confirmClearTitle')}</DialogTitle>
					<DialogDescription>{t('trash.confirmClearDescription')}</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} variant="outline">
						{t('actions.cancel')}
					</Button>
					<Button disabled={mutation.isPending} onClick={onClear} variant="destructive">
						{t('trash.clear')}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
