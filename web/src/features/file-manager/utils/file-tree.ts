import type { FileBrowserResource } from '@sealos-storage-manager/filebrowser-client'
import type { FileEntry, FileTableRow } from '@/features/file-manager/types/file-manager'

import { normalizePath } from '@sealos-storage-manager/filebrowser-client'

export const trashRootPath = '/.storage-manager-trash'
export const trashIndexPath = `${trashRootPath}/index.json`

export type FileSortField = 'name' | 'type' | 'size' | 'modified'
export type FileSortDirection = 'asc' | 'desc'

export interface FileSortState {
	direction: FileSortDirection
	field: FileSortField
}

export function flattenResources(resource: FileBrowserResource, depth = 0): FileEntry[] {
	const items = resource.items ?? []
	const entries: FileEntry[] = []
	for (const item of items) {
		if (normalizePath(item.path) === trashRootPath) {
			continue
		}
		entries.push({
			depth,
			isDir: item.isDir,
			modified: item.modified,
			name: item.name,
			path: normalizePath(item.path),
			size: item.size,
			type: item.isDir ? 'directory' : 'file',
		})
	}
	return entries
}

export function sortEntries(entries: FileEntry[], sort: FileSortState): FileEntry[] {
	return [...entries].sort((left, right) => {
		if (left.isDir !== right.isDir) {
			return left.isDir ? -1 : 1
		}
		const multiplier = sort.direction === 'asc' ? 1 : -1
		switch (sort.field) {
			case 'size':
				return (left.size - right.size) * multiplier
			case 'modified':
				return left.modified.localeCompare(right.modified) * multiplier
			case 'type':
				return left.type.localeCompare(right.type) * multiplier
			case 'name':
				return left.name.localeCompare(right.name) * multiplier
			default:
				return 0
		}
	})
}

export interface ExpandedFolderBranch {
	entries?: FileEntry[]
	error?: Error
	isLoading?: boolean
}

export type ExpandedFolderMap = Record<string, ExpandedFolderBranch | undefined>

export function buildFileTableRows(
	entries: FileEntry[],
	expandedPaths: Set<string>,
	branches: ExpandedFolderMap,
): FileTableRow[] {
	const rows: FileTableRow[] = []
	appendRows(rows, entries, expandedPaths, branches)
	return rows
}

function appendRows(
	rows: FileTableRow[],
	entries: FileEntry[],
	expandedPaths: Set<string>,
	branches: ExpandedFolderMap,
) {
	for (const entry of entries) {
		rows.push({
			entry,
			id: `resource:${entry.path}`,
			kind: 'resource',
		})

		if (!entry.isDir || !expandedPaths.has(entry.path)) {
			continue
		}

		const branch = branches[entry.path]
		if (branch?.isLoading) {
			rows.push({
				depth: entry.depth + 1,
				id: `branch-loading:${entry.path}`,
				kind: 'branch-loading',
				path: entry.path,
			})
			continue
		}

		if (branch?.error) {
			rows.push({
				depth: entry.depth + 1,
				error: branch.error,
				id: `branch-error:${entry.path}`,
				kind: 'branch-error',
				path: entry.path,
			})
			continue
		}

		appendRows(rows, branch?.entries ?? [], expandedPaths, branches)
	}
}

export function nextSortState(current: FileSortState, field: FileSortField): FileSortState {
	if (current.field === field) {
		return {
			field,
			direction: current.direction === 'asc' ? 'desc' : 'asc',
		}
	}
	return { field, direction: 'asc' }
}

export function isEditableFile(path: string) {
	return /\.(?:txt|md|json|yaml|yml|csv|log|env|ini|conf|xml|html|css|js|ts|tsx|jsx)$/i.test(path)
}

export function fileNameFromPath(path: string) {
	const normalized = normalizePath(path)
	const parts = normalized.split('/').filter(Boolean)
	return parts.at(-1) ?? '/'
}

export function remainingTrashDays(deletedAt: string, retentionDays = 30) {
	const deleted = Date.parse(deletedAt)
	if (!Number.isFinite(deleted)) {
		return retentionDays
	}
	const elapsedDays = Math.floor((Date.now() - deleted) / 86_400_000)
	return Math.max(0, retentionDays - elapsedDays)
}

export function trashObjectPath(originalPath: string, id: string) {
	const normalized = normalizePath(originalPath)
	const name = fileNameFromPath(normalized)
	return `${trashRootPath}/objects/${id}-${encodeURIComponent(name)}`
}
