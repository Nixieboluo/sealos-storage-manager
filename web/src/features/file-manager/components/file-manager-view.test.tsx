import type { FileBrowserResource } from '@sealos-storage-manager/filebrowser-client'
import type { FileBrowserSession } from '@/features/file-manager/types/file-manager'

import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FileManagerView } from '@/features/file-manager/components/file-manager-view'
import { pvcFixture, viewerSessionFixture, viewerTokenFixture } from '@/features/viewer/test/fakes'
import { deriveSessionCapability } from '@/features/viewer/utils/session-capability'
import { renderWithProviders } from '@/test/render'

function resource(path: string, name: string, isDir: boolean, items?: FileBrowserResource[]): FileBrowserResource {
	return {
		isDir,
		items,
		modified: '2026-05-14T10:00:00Z',
		name,
		path,
		size: isDir ? 0 : 12,
	}
}

function readyCapability() {
	return deriveSessionCapability({
		error: null,
		isReconnecting: false,
		manualCloseKind: null,
		selectedPVC: pvcFixture(),
		session: viewerSessionFixture({ status: 'ready', token_ready: true }),
		status: 'ready',
		token: viewerTokenFixture(),
	})
}

function reconnectingCapability() {
	return deriveSessionCapability({
		error: null,
		isReconnecting: true,
		manualCloseKind: null,
		selectedPVC: pvcFixture(),
		session: viewerSessionFixture({ status: 'ready', token_ready: true }),
		status: 'failed',
		token: null,
	})
}

function renderFileManager(session: FileBrowserSession | null, currentPath = '/') {
	return renderWithProviders(
		<FileManagerView
			currentPath={currentPath}
			onBackToVolumes={vi.fn()}
			onPathChange={vi.fn()}
			onReconnect={vi.fn()}
			onRefreshSession={vi.fn()}
			pvcName="data"
			session={session}
			sessionCapability={session
				? readyCapability()
				: deriveSessionCapability({
						error: null,
						isReconnecting: false,
						manualCloseKind: null,
						selectedPVC: pvcFixture(),
						session: viewerSessionFixture({ status: 'creating', token_ready: false }),
						status: 'polling',
						token: null,
					})}
			setSort={vi.fn()}
			sort={{ field: 'name', direction: 'asc' }}
		/>,
	)
}

describe('fileManagerView', () => {
	it('hides the file table when the viewer session is not ready', () => {
		renderFileManager(null)

		expect(screen.getByText(/pod session is available/i)).toBeInTheDocument()
		expect(screen.queryByRole('columnheader', { name: /name/i })).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: /new folder/i })).not.toBeInTheDocument()
	})

	it('expands folder rows and renders all returned children without a page limit', async () => {
		const user = userEvent.setup()
		const childItems = Array.from({ length: 30 }, (_, index) =>
			resource(`/docs/file-${index}.txt`, `file-${index}.txt`, false))
		const list = vi.fn(async (path: string) => {
			if (path === '/docs') {
				return resource('/docs', 'docs', true, childItems)
			}
			return resource('/', '', true, [
				resource('/docs', 'docs', true),
				resource('/readme.md', 'readme.md', false),
			])
		})
		const session = {
			client: {
				list,
			},
			pvcKey: 'pvc-1',
		} as unknown as FileBrowserSession

		renderFileManager(session)

		await screen.findByText('docs')
		await user.click(screen.getAllByRole('button', { name: /toggle folder/i })[0]!)

		await waitFor(() => expect(list).toHaveBeenCalledWith('/docs', expect.any(AbortSignal)))
		expect(await screen.findByText('file-29.txt')).toBeInTheDocument()
		expect(screen.getByText('file-0.txt')).toBeInTheDocument()
		expect(screen.queryByText(/enter folder/i)).not.toBeInTheDocument()
	})

	it('keeps previous rows visible with a pending overlay during a path change', async () => {
		let resolveDocs: (value: FileBrowserResource) => void = () => undefined
		const docsPromise = new Promise<FileBrowserResource>((resolve) => {
			resolveDocs = resolve
		})
		const list = vi.fn(async (path: string) => {
			if (path === '/docs') {
				return docsPromise
			}
			return resource('/', '', true, [
				resource('/readme.md', 'readme.md', false),
			])
		})
		const session = {
			client: {
				list,
			},
			pvcKey: 'pvc-1',
		} as unknown as FileBrowserSession
		const { rerender } = renderWithProviders(
			<FileManagerView
				currentPath="/"
				onBackToVolumes={vi.fn()}
				onPathChange={vi.fn()}
				onReconnect={vi.fn()}
				onRefreshSession={vi.fn()}
				pvcName="data"
				session={session}
				sessionCapability={readyCapability()}
				setSort={vi.fn()}
				sort={{ field: 'name', direction: 'asc' }}
			/>,
		)

		expect(await screen.findByText('readme.md')).toBeInTheDocument()
		rerender(
			<FileManagerView
				currentPath="/docs"
				onBackToVolumes={vi.fn()}
				onPathChange={vi.fn()}
				onReconnect={vi.fn()}
				onRefreshSession={vi.fn()}
				pvcName="data"
				session={session}
				sessionCapability={readyCapability()}
				setSort={vi.fn()}
				sort={{ field: 'name', direction: 'asc' }}
			/>,
		)

		expect(screen.getByText('readme.md')).toBeInTheDocument()
		expect(screen.getByRole('status')).toHaveTextContent(/pending file list/i)
		expect(screen.getByRole('button', { name: /download/i })).toBeDisabled()

		resolveDocs(resource('/docs', 'docs', true, [
			resource('/docs/next.txt', 'next.txt', false),
		]))
		expect(await screen.findByText('next.txt')).toBeInTheDocument()
		expect(screen.queryByRole('status')).not.toBeInTheDocument()
	})

	it('keeps the last file list visible and disabled while the viewer session reconnects', async () => {
		const list = vi.fn(async () => resource('/', '', true, [
			resource('/readme.md', 'readme.md', false),
		]))
		const session = {
			client: {
				list,
			},
			pvcKey: 'pvc-1',
		} as unknown as FileBrowserSession
		const { rerender } = renderWithProviders(
			<FileManagerView
				currentPath="/"
				onBackToVolumes={vi.fn()}
				onPathChange={vi.fn()}
				onReconnect={vi.fn()}
				onRefreshSession={vi.fn()}
				pvcName="data"
				session={session}
				sessionCapability={readyCapability()}
				setSort={vi.fn()}
				sort={{ field: 'name', direction: 'asc' }}
			/>,
		)

		expect(await screen.findByText('readme.md')).toBeInTheDocument()
		expect(list).toHaveBeenCalledTimes(1)

		rerender(
			<FileManagerView
				currentPath="/"
				onBackToVolumes={vi.fn()}
				onPathChange={vi.fn()}
				onReconnect={vi.fn()}
				onRefreshSession={vi.fn()}
				pvcName="data"
				session={session}
				sessionCapability={reconnectingCapability()}
				setSort={vi.fn()}
				sort={{ field: 'name', direction: 'asc' }}
			/>,
		)

		expect(screen.getByText('readme.md')).toBeInTheDocument()
		expect(screen.getByRole('status')).toHaveTextContent(/reconnecting viewer session/i)
		expect(screen.getByRole('button', { name: /download/i })).toBeDisabled()
		expect(list).toHaveBeenCalledTimes(1)
	})

	it('shows a branch error row when folder expansion fails', async () => {
		const user = userEvent.setup()
		const list = vi.fn(async (path: string) => {
			if (path === '/docs') {
				throw new Error('folder failed')
			}
			return resource('/', '', true, [
				resource('/docs', 'docs', true),
			])
		})
		const session = {
			client: {
				list,
			},
			pvcKey: 'pvc-1',
		} as unknown as FileBrowserSession

		renderFileManager(session)

		await screen.findByText('docs')
		await user.click(screen.getByRole('button', { name: /toggle folder/i }))

		const row = await screen.findByText('folder failed')
		expect(within(row.closest('tr')!).getByRole('button', { name: /retry folder/i })).toBeInTheDocument()
	})
})
