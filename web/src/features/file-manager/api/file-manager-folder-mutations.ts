import type { QueryClient } from '@tanstack/react-query'
import type { FileBrowserSession } from '@/features/file-manager/types/file-manager'

import { joinPath } from '@sealos-storage-manager/filebrowser-client'
import { mutationOptions } from '@tanstack/react-query'

import { invalidateFileManagerAfterMutation } from '@/features/file-manager/api/file-manager-cache'
import { fileManagerKeys } from '@/features/file-manager/api/file-manager-query-keys'
import { requireSession } from '@/features/file-manager/api/file-manager-session'

export interface CreateFolderInput {
	currentPath: string
	name: string
}

export function createFolderMutationOptions(
	queryClient: QueryClient,
	session: FileBrowserSession | null,
) {
	return mutationOptions({
		mutationKey: fileManagerKeys.mutations.createFolder(session?.pvcKey ?? 'inactive'),
		mutationFn: async (input: CreateFolderInput) => {
			const activeSession = requireSession(session)
			const path = joinPath(input.currentPath, input.name)
			await activeSession.client.createFolder(path)
			return { path }
		},
		onSuccess: ({ path }) => {
			if (!session) {
				return
			}
			invalidateFileManagerAfterMutation(queryClient, session, [path])
		},
	})
}
