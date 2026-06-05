import type { QueryClient } from '@tanstack/react-query'
import type { FileBrowserSession, RecycleEntry } from '@/features/file-manager/types/file-manager'

import { mutationOptions } from '@tanstack/react-query'

import { invalidateFileManagerAfterMutation } from '@/features/file-manager/api/file-manager-cache'
import { fileManagerKeys } from '@/features/file-manager/api/file-manager-query-keys'
import { requireSession } from '@/features/file-manager/api/file-manager-session'
import { clearRecycleBin, moveToRecycleBin, restoreRecycleEntry } from '@/features/file-manager/api/recycle-bin-api'

export interface MoveToRecycleBinInput {
	isDir: boolean
	path: string
	size: number
}

export function moveToRecycleBinMutationOptions(
	queryClient: QueryClient,
	session: FileBrowserSession | null,
) {
	return mutationOptions({
		mutationKey: fileManagerKeys.mutations.moveToRecycleBin(session?.pvcKey ?? 'inactive'),
		mutationFn: (input: MoveToRecycleBinInput) => {
			const activeSession = requireSession(session)
			return moveToRecycleBin(activeSession.client, input.path, input.isDir, input.size)
		},
		onSuccess: (entry) => {
			if (!session) {
				return
			}
			invalidateFileManagerAfterMutation(queryClient, session, [entry.originalPath, entry.trashPath])
		},
	})
}

export function restoreRecycleEntryMutationOptions(
	queryClient: QueryClient,
	session: FileBrowserSession | null,
) {
	return mutationOptions({
		mutationKey: fileManagerKeys.mutations.restoreRecycleEntry(session?.pvcKey ?? 'inactive'),
		mutationFn: async (entry: RecycleEntry) => {
			const activeSession = requireSession(session)
			await restoreRecycleEntry(activeSession.client, entry)
			return entry
		},
		onSuccess: (entry) => {
			if (!session) {
				return
			}
			invalidateFileManagerAfterMutation(queryClient, session, [entry.originalPath, entry.trashPath])
		},
	})
}

export function clearRecycleBinMutationOptions(
	queryClient: QueryClient,
	session: FileBrowserSession | null,
) {
	return mutationOptions({
		mutationKey: fileManagerKeys.mutations.clearRecycleBin(session?.pvcKey ?? 'inactive'),
		mutationFn: async () => {
			const activeSession = requireSession(session)
			await clearRecycleBin(activeSession.client)
		},
		onSuccess: () => {
			if (!session) {
				return
			}
			invalidateFileManagerAfterMutation(queryClient, session, ['/'])
		},
	})
}
