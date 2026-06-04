import { describe, expect, it, vi } from 'vitest'

import {
	buildFileTableRows,
	fileNameFromPath,
	flattenResources,
	nextSortState,
	remainingTrashDays,
	sortEntries,
	trashObjectPath,
	trashRootPath,
} from '@/features/file-manager/utils/file-tree'

describe('file tree helpers', () => {
	it('flattens resources while hiding the storage manager trash folder', () => {
		const entries = flattenResources({
			path: '/',
			name: '',
			size: 0,
			modified: '',
			isDir: true,
			items: [
				{ path: '/docs', name: 'docs', size: 0, modified: '2026-05-14T10:00:00Z', isDir: true },
				{ path: trashRootPath, name: '.storage-manager-trash', size: 0, modified: '', isDir: true },
				{ path: '/readme.md', name: 'readme.md', size: 12, modified: '2026-05-14T10:01:00Z', isDir: false },
			],
		})

		expect(entries.map(entry => entry.path)).toEqual(['/docs', '/readme.md'])
	})

	it('drops self-referential child resources from folder listings', () => {
		const entries = flattenResources({
			path: '/docs',
			name: 'docs',
			size: 0,
			modified: '',
			isDir: true,
			items: [
				{ path: '/docs', name: 'docs', size: 0, modified: '', isDir: true },
				{ path: '/docs/readme.md', name: 'readme.md', size: 12, modified: '', isDir: false },
			],
		}, 1)

		expect(entries.map(entry => entry.path)).toEqual(['/docs/readme.md'])
	})

	it('caps flattened entries from very large File Browser responses', () => {
		const entries = flattenResources({
			path: '/docs',
			name: 'docs',
			size: 0,
			modified: '',
			isDir: true,
			items: Array.from({ length: 20 }, (_, index) => ({
				path: `/docs/file-${index}.txt`,
				name: `file-${index}.txt`,
				size: index,
				modified: '',
				isDir: false,
			})),
		}, 1, { maxEntries: 5 })

		expect(entries).toHaveLength(5)
		expect(entries.map(entry => entry.path)).toEqual([
			'/docs/file-0.txt',
			'/docs/file-1.txt',
			'/docs/file-2.txt',
			'/docs/file-3.txt',
			'/docs/file-4.txt',
		])
	})

	it('builds async tree rows without applying a client-side page limit', () => {
		const childItems = Array.from({ length: 30 }, (_, index) => ({
			path: `/docs/file-${index}.txt`,
			name: `file-${index}.txt`,
			size: index,
			modified: '2026-05-14T10:00:00Z',
			isDir: false,
		}))
		const rootEntries = flattenResources({
			path: '/',
			name: '',
			size: 0,
			modified: '',
			isDir: true,
			items: [
				{ path: '/docs', name: 'docs', size: 0, modified: '', isDir: true },
			],
		})
		const childEntries = flattenResources({
			path: '/docs',
			name: 'docs',
			size: 0,
			modified: '',
			isDir: true,
			items: childItems,
		}, 1)

		const rows = buildFileTableRows(rootEntries, new Set(['/docs']), {
			'/docs': { entries: childEntries },
		})

		expect(rows).toHaveLength(31)
		expect(rows.filter(row => row.kind === 'resource')).toHaveLength(31)
		expect(rows.some(row => row.kind !== 'resource')).toBe(false)
	})

	it('keeps loading folders on their own row and inserts error rows', () => {
		const rootEntries = flattenResources({
			path: '/',
			name: '',
			size: 0,
			modified: '',
			isDir: true,
			items: [
				{ path: '/loading', name: 'loading', size: 0, modified: '', isDir: true },
				{ path: '/failed', name: 'failed', size: 0, modified: '', isDir: true },
			],
		})

		const rows = buildFileTableRows(rootEntries, new Set(['/loading', '/failed']), {
			'/loading': { isLoading: true },
			'/failed': { error: new Error('failed') },
		})

		expect(rows.map(row => row.kind)).toEqual([
			'resource',
			'resource',
			'branch-error',
		])
	})

	it('does not recurse forever when expanded branches contain ancestor, duplicate, or outside paths', () => {
		const rootEntries = flattenResources({
			path: '/',
			name: '',
			size: 0,
			modified: '',
			isDir: true,
			items: [
				{ path: '/docs', name: 'docs', size: 0, modified: '', isDir: true },
			],
		})
		const docsEntries = flattenResources({
			path: '/docs',
			name: 'docs',
			size: 0,
			modified: '',
			isDir: true,
			items: [
				{ path: '/', name: '..', size: 0, modified: '', isDir: true },
				{ path: '/outside', name: 'outside', size: 0, modified: '', isDir: true },
				{ path: '/docs/nested', name: 'nested', size: 0, modified: '', isDir: true },
			],
		}, 1)
		const nestedEntries = flattenResources({
			path: '/docs/nested',
			name: 'nested',
			size: 0,
			modified: '',
			isDir: true,
			items: [
				{ path: '/docs', name: 'docs', size: 0, modified: '', isDir: true },
				{ path: '/docs/nested', name: 'nested duplicate', size: 0, modified: '', isDir: true },
				{ path: '/docs/nested/file.txt', name: 'file.txt', size: 1, modified: '', isDir: false },
			],
		}, 2)

		const rows = buildFileTableRows(rootEntries, new Set(['/docs', '/docs/nested']), {
			'/docs': { entries: docsEntries },
			'/docs/nested': { entries: nestedEntries },
		})

		expect(rows.filter(row => row.kind === 'resource').map(row => row.entry.path)).toEqual([
			'/docs',
			'/docs/nested',
			'/docs/nested/file.txt',
		])
	})

	it('caps async tree rows to protect the table from pathological branch payloads', () => {
		const rootEntries = flattenResources({
			path: '/',
			name: '',
			size: 0,
			modified: '',
			isDir: true,
			items: [
				{ path: '/docs', name: 'docs', size: 0, modified: '', isDir: true },
			],
		})
		const childEntries = flattenResources({
			path: '/docs',
			name: 'docs',
			size: 0,
			modified: '',
			isDir: true,
			items: Array.from({ length: 20 }, (_, index) => ({
				path: `/docs/file-${index}.txt`,
				name: `file-${index}.txt`,
				size: index,
				modified: '',
				isDir: false,
			})),
		}, 1)

		const rows = buildFileTableRows(rootEntries, new Set(['/docs']), {
			'/docs': { entries: childEntries },
		}, { maxRows: 5 })

		expect(rows).toHaveLength(5)
		expect(rows.filter(row => row.kind === 'resource').map(row => row.entry.path)).toEqual([
			'/docs',
			'/docs/file-0.txt',
			'/docs/file-1.txt',
			'/docs/file-2.txt',
			'/docs/file-3.txt',
		])
	})

	it('sorts folders first and toggles sort direction', () => {
		const entries = flattenResources({
			path: '/',
			name: '',
			size: 0,
			modified: '',
			isDir: true,
			items: [
				{ path: '/b.txt', name: 'b.txt', size: 2, modified: '2026-05-14T10:01:00Z', isDir: false },
				{ path: '/a', name: 'a', size: 0, modified: '2026-05-14T10:00:00Z', isDir: true },
			],
		})

		expect(sortEntries(entries, { field: 'name', direction: 'asc' }).map(entry => entry.name)).toEqual(['a', 'b.txt'])
		expect(nextSortState({ field: 'name', direction: 'asc' }, 'name')).toEqual({ field: 'name', direction: 'desc' })
	})

	it('formats trash metadata helpers', () => {
		vi.setSystemTime(new Date('2026-05-15T00:00:00Z'))

		expect(fileNameFromPath('/a/b.txt')).toBe('b.txt')
		expect(trashObjectPath('/a/b.txt', 'id-1')).toBe('/.storage-manager-trash/objects/id-1-b.txt')
		expect(remainingTrashDays('2026-05-14T00:00:00Z')).toBe(29)

		vi.useRealTimers()
	})

	it('keeps trash object paths readable and leaves request encoding to the client', () => {
		expect(trashObjectPath('/a folder/中文/% done', 'id-1')).toBe('/.storage-manager-trash/objects/id-1-% done')
		expect(trashObjectPath('/a/test', 'id-2')).toBe('/.storage-manager-trash/objects/id-2-test')
		expect(trashObjectPath('/a/test1', 'id-3')).toBe('/.storage-manager-trash/objects/id-3-test1')
	})
})
