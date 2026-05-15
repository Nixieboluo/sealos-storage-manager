import { describe, expect, it, vi } from 'vitest'

import {
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
})
