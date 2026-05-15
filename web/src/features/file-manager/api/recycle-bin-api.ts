import type { FileBrowserClient } from '@sealos-storage-manager/filebrowser-client'
import type { RecycleEntry } from '@/features/file-manager/types/file-manager'

import { FileBrowserError, normalizePath } from '@sealos-storage-manager/filebrowser-client'

import { trashIndexPath, trashObjectPath } from '@/features/file-manager/utils/file-tree'

interface RecycleIndex {
	items: RecycleEntry[]
	version: 1
}

const emptyIndex: RecycleIndex = {
	version: 1,
	items: [],
}

export async function readRecycleIndex(client: FileBrowserClient): Promise<RecycleEntry[]> {
	try {
		const text = await client.readText(trashIndexPath)
		const parsed = JSON.parse(text) as Partial<RecycleIndex>
		return Array.isArray(parsed.items) ? parsed.items : []
	}
	catch (error) {
		if (error instanceof FileBrowserError && error.status === 404) {
			return []
		}
		return []
	}
}

export async function writeRecycleIndex(client: FileBrowserClient, items: RecycleEntry[]): Promise<void> {
	await ensureTrashFolders(client)
	await client.writeText(trashIndexPath, JSON.stringify({ ...emptyIndex, items }, null, 2), true)
}

export async function moveToRecycleBin(client: FileBrowserClient, path: string, isDir: boolean, size: number): Promise<RecycleEntry> {
	await ensureTrashFolders(client)
	const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
	const normalized = normalizePath(path)
	const trashPath = trashObjectPath(normalized, id)
	const current = await readRecycleIndex(client)
	const entry: RecycleEntry = {
		deletedAt: new Date().toISOString(),
		id,
		isDir,
		name: normalized.split('/').filter(Boolean).at(-1) ?? normalized,
		originalPath: normalized,
		size,
		trashPath,
	}
	await client.move(normalized, trashPath, true)
	await writeRecycleIndex(client, [entry, ...current])
	return entry
}

export async function restoreRecycleEntry(client: FileBrowserClient, entry: RecycleEntry): Promise<void> {
	await client.move(entry.trashPath, entry.originalPath, true)
	const remaining = (await readRecycleIndex(client)).filter(item => item.id !== entry.id)
	await writeRecycleIndex(client, remaining)
}

export async function clearRecycleBin(client: FileBrowserClient): Promise<void> {
	const items = await readRecycleIndex(client)
	await Promise.all(items.map(item => client.deletePermanent(item.trashPath).catch(() => undefined)))
	await writeRecycleIndex(client, [])
}

async function ensureTrashFolders(client: FileBrowserClient): Promise<void> {
	await ensureFolder(client, '/.storage-manager-trash')
	await ensureFolder(client, '/.storage-manager-trash/objects')
}

async function ensureFolder(client: FileBrowserClient, path: string): Promise<void> {
	try {
		await client.createFolder(path)
	}
	catch (error) {
		if (error instanceof FileBrowserError && (error.status === 404 || error.status === 409)) {
			return
		}
		throw error
	}
}
