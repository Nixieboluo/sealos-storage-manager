import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { uploadActions } from '@/features/file-manager/stores/upload-store'
import { SessionActions } from '@/features/viewer/components/session-actions'
import { createFakeViewerAPI } from '@/features/viewer/test/fakes'
import { renderWithProviders } from '@/test/render'

describe('sessionActions', () => {
	it('blocks manual session closes while uploads are active', async () => {
		const user = userEvent.setup()
		uploadActions.reset()
		uploadActions.addTask({
			id: 'upload-1',
			fileName: 'large.bin',
			targetPath: '/',
			bytesUploaded: 0,
			bytesTotal: 100,
			podSessionID: 'ps_1',
			status: 'uploading',
			viewerSessionID: 'vs_1',
		})
		const closeViewerSession = vi.fn().mockResolvedValue({})
		const closePodSession = vi.fn().mockResolvedValue({})
		const api = createFakeViewerAPI({ closePodSession, closeViewerSession })

		renderWithProviders(
			<SessionActions
				api={api}
				podSessionID="ps_1"
				viewerSessionID="vs_1"
			/>,
		)

		await user.click(screen.getByRole('button', { name: /close viewer/i }))

		expect(await screen.findByText(/upload in progress/i)).toBeInTheDocument()
		expect(closeViewerSession).not.toHaveBeenCalled()

		await user.click(screen.getAllByRole('button', { name: /^close$/i })[0]!)
		await user.click(screen.getByRole('button', { name: /close pod session/i }))

		expect(await screen.findByText(/still using this pod session/i)).toBeInTheDocument()
		expect(closePodSession).not.toHaveBeenCalled()
	})
})
