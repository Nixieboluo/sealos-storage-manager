import type { FileBrowserSession } from '@/features/file-manager/types/file-manager'

export function requireSession(session: FileBrowserSession | null): FileBrowserSession {
	if (!session) {
		throw new Error('File Browser session is not ready')
	}
	return session
}
