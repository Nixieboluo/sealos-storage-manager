import type { QueryClient } from '@tanstack/react-query'
import type { FileBrowserSession } from '@/features/file-manager/types/file-manager'

import { mutationOptions } from '@tanstack/react-query'

import { invalidateFileManagerAfterMutation } from '@/features/file-manager/api/file-manager-cache'
import { fileManagerKeys } from '@/features/file-manager/api/file-manager-query-keys'
import { requireSession } from '@/features/file-manager/api/file-manager-session'

export interface SaveTextInput {
	content: string
	path: string
}

export function saveFileTextMutationOptions(
	queryClient: QueryClient,
	session: FileBrowserSession | null,
) {
	return mutationOptions({
		mutationKey: fileManagerKeys.mutations.saveText(session?.pvcKey ?? 'inactive'),
		mutationFn: async (input: SaveTextInput) => {
			const activeSession = requireSession(session)
			await activeSession.client.saveText(input.path, input.content)
			return input
		},
		onSuccess: (input) => {
			if (!session) {
				return
			}
			queryClient.setQueryData(fileManagerKeys.text(session.pvcKey, input.path), input.content)
			invalidateFileManagerAfterMutation(queryClient, session, [input.path])
		},
	})
}
