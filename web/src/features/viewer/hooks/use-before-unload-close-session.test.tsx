import { waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { uploadActions } from '@/features/file-manager/stores/upload-store'
import { useBeforeUnloadCloseSession } from '@/features/viewer/hooks/use-before-unload-close-session'
import { createFakeViewerAPI } from '@/features/viewer/test/fakes'
import { renderHookWithProviders } from '@/test/render'

describe('useBeforeUnloadCloseSession', () => {
	beforeEach(() => {
		uploadActions.reset()
	})

	it('closes the active viewer session on pagehide', async () => {
		const closeViewerSession = vi.fn().mockResolvedValue({})
		const api = createFakeViewerAPI({ closeViewerSession })

		const { unmount } = renderHookWithProviders(() =>
			useBeforeUnloadCloseSession({
				api,
				enabled: true,
				viewerSessionID: 'vs_1',
			}),
		)

		window.dispatchEvent(new Event('pagehide'))
		await waitFor(() => expect(closeViewerSession).toHaveBeenCalledWith('vs_1'))

		unmount()
		window.dispatchEvent(new Event('pagehide'))
		expect(closeViewerSession).toHaveBeenCalledTimes(1)
	})

	it('does not close viewer sessions during active uploads and registers an unload prompt', () => {
		uploadActions.reset()
		uploadActions.addTask({
			id: 'upload-1',
			fileName: 'large.bin',
			targetPath: '/',
			bytesUploaded: 0,
			bytesTotal: 100,
			status: 'uploading',
			viewerSessionID: 'vs_1',
		})
		const closeViewerSession = vi.fn().mockResolvedValue({})
		const api = createFakeViewerAPI({ closeViewerSession })

		renderHookWithProviders(() =>
			useBeforeUnloadCloseSession({
				api,
				enabled: true,
				hasActiveUpload: true,
				viewerSessionID: 'vs_1',
			}),
		)

		window.dispatchEvent(new Event('pagehide'))
		expect(closeViewerSession).not.toHaveBeenCalled()

		const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
		window.dispatchEvent(event)

		expect(event.defaultPrevented).toBe(true)
	})

	it('does not duplicate pagehide listeners when callback props change', async () => {
		const closeViewerSession = vi.fn().mockResolvedValue({})
		const api = createFakeViewerAPI({ closeViewerSession })

		const { rerender } = renderHookWithProviders(
			(_props: { marker: number }) =>
				useBeforeUnloadCloseSession({
					api,
					enabled: true,
					hasActiveUpload: false,
					viewerSessionID: 'vs_1',
				}),
			{ initialProps: { marker: 1 } },
		)

		rerender({ marker: 2 })
		rerender({ marker: 3 })

		window.dispatchEvent(new Event('pagehide'))
		await waitFor(() => expect(closeViewerSession).toHaveBeenCalledTimes(1))
	})
})
