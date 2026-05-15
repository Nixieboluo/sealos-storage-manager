import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ViewerApiError } from '@/features/viewer/api/viewer-error'
import { StorageAppShell } from '@/features/viewer/components/storage-app-shell'
import { viewerUIStore } from '@/features/viewer/stores/viewer-ui-store'
import { createFakeViewerAPI, pvcFixture, viewerSessionFixture, viewerTokenFixture } from '@/features/viewer/test/fakes'
import { renderWithProviders } from '@/test/render'

describe('storageAppShell', () => {
	beforeEach(() => {
		viewerUIStore.actions.reset()
	})

	it('renders PVCs, filters them, launches File Browser, and shows real file manager state', async () => {
		const user = userEvent.setup()
		const api = createFakeViewerAPI({
			createViewerSession: vi.fn().mockResolvedValue(viewerSessionFixture({
				id: 'vs_1',
				status: 'ready',
				token_ready: true,
			})),
			issueViewerToken: vi.fn().mockResolvedValue(viewerTokenFixture({
				viewer_session_id: 'vs_1',
				viewer_url: 'https://viewer.example.test',
			})),
			listPVCs: vi.fn().mockResolvedValue([
				pvcFixture({ name: 'mysql-data', uid: 'uid-1' }),
				pvcFixture({ name: 'logs', uid: 'uid-2' }),
			]),
		})

		renderWithProviders(<StorageAppShell api={api} />)

		expect(await screen.findByText('mysql-data')).toBeInTheDocument()
		expect(screen.getByText('logs')).toBeInTheDocument()

		await user.type(screen.getByLabelText('Search'), 'mysql')
		await waitFor(() => expect(screen.queryByText('logs')).not.toBeInTheDocument())
		expect(screen.getByText('mysql-data')).toBeInTheDocument()

		await user.click(screen.getByRole('button', { name: /browse files/i }))

		await waitFor(() => expect(screen.getByRole('button', { name: /new folder/i })).toBeInTheDocument())
	})

	it('creates PVCs through the real dialog and optimistic mutation path', async () => {
		const user = userEvent.setup()
		const createPVC = vi.fn().mockResolvedValue(pvcFixture({
			name: 'cache-data',
			uid: 'cache-uid',
			capacity: '5Gi',
			capacity_bytes: 5 * 1024 * 1024 * 1024,
		}))
		const api = createFakeViewerAPI({
			createPVC,
			listPVCs: vi.fn().mockResolvedValue([]),
		})

		renderWithProviders(<StorageAppShell api={api} />)

		await user.click(await screen.findByRole('button', { name: /create pvc/i }))
		await user.type(screen.getByLabelText('Name'), 'cache-data')
		const capacityInput = screen.getByLabelText('Capacity')
		await user.clear(capacityInput)
		await user.type(capacityInput, '5')
		await user.click(screen.getByRole('button', { name: /^create$/i }))

		await waitFor(() => expect(createPVC).toHaveBeenCalledWith(expect.objectContaining({
			name: 'cache-data',
			capacity: '5Gi',
			capacityBytes: 5 * 1024 * 1024 * 1024,
		})))
	})

	it('shows localized API errors', async () => {
		const api = createFakeViewerAPI({
			listPVCs: vi.fn().mockRejectedValue(new ViewerApiError({
				code: 'PVC_ACCESS_DENIED',
				message: 'denied',
				status: 403,
			})),
		})

		renderWithProviders(<StorageAppShell api={api} />)

		expect(await screen.findByText(/permission to access/i)).toBeInTheDocument()
	})
})
