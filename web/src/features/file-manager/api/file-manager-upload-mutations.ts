import type { QueryClient } from '@tanstack/react-query'
import type { UploadTask } from '@/features/file-manager/stores/upload-store'
import type { FileBrowserSession } from '@/features/file-manager/types/file-manager'

import { joinPath } from '@sealos-storage-manager/filebrowser-client'
import { mutationOptions } from '@tanstack/react-query'

import { env } from '@/config/env'
import { invalidateFileManagerAfterMutation } from '@/features/file-manager/api/file-manager-cache'
import { fileManagerKeys } from '@/features/file-manager/api/file-manager-query-keys'
import { requireSession } from '@/features/file-manager/api/file-manager-session'
import { uploadActions } from '@/features/file-manager/stores/upload-store'

export interface UploadFileInput {
	currentPath: string
	file: File
	podSessionID?: string
	taskID?: string
	viewerSessionID?: string
}

export interface UploadProgressSnapshot {
	bytesTotal: number
	bytesUploaded: number
	chunkIndex: number
	chunkTotal: number
}

export function createUploadTaskID(fileName: string): string {
	const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)
	return `${Date.now()}-${random}-${fileName}`
}

export function shouldReportUploadProgress(input: {
	current: UploadProgressSnapshot
	last: UploadProgressSnapshot | null
	lastReportedAt: number
	now: number
	throttleMs?: number
}): boolean {
	const throttleMs = input.throttleMs ?? 250
	if (!input.last) {
		return true
	}
	if (input.current.bytesUploaded >= input.current.bytesTotal) {
		return true
	}
	if (input.current.chunkIndex !== input.last.chunkIndex) {
		return true
	}
	return input.now - input.lastReportedAt >= throttleMs
}

export function uploadFileMutationOptions(
	queryClient: QueryClient,
	session: FileBrowserSession | null,
) {
	return mutationOptions({
		mutationKey: fileManagerKeys.mutations.uploadFile(session?.pvcKey ?? 'inactive'),
		mutationFn: async (input: UploadFileInput) => {
			const activeSession = requireSession(session)
			const id = input.taskID ?? createUploadTaskID(input.file.name)
			const chunkSizeBytes = env.fileUploadTusChunkBytes
			const chunkTotal = Math.max(1, Math.ceil(input.file.size / chunkSizeBytes))
			const task: UploadTask = {
				id,
				fileName: input.file.name,
				targetPath: input.currentPath,
				bytesUploaded: 0,
				bytesTotal: input.file.size,
				chunkIndex: 0,
				chunkSizeBytes,
				chunkTotal,
				podSessionID: input.podSessionID,
				pvcKey: activeSession.pvcKey,
				status: 'uploading',
				viewerSessionID: input.viewerSessionID,
			}
			uploadActions.addTask(task)
			let lastProgress: UploadProgressSnapshot | null = null
			let lastReportedAt = 0
			try {
				const publishProgress = (snapshot: UploadProgressSnapshot, force = false) => {
					const now = Date.now()
					if (!force && !shouldReportUploadProgress({
						current: snapshot,
						last: lastProgress,
						lastReportedAt,
						now,
					})) {
						return
					}
					lastProgress = snapshot
					lastReportedAt = now
					uploadActions.updateTask(id, {
						bytesUploaded: snapshot.bytesUploaded,
						bytesTotal: snapshot.bytesTotal,
						chunkIndex: snapshot.chunkIndex,
						chunkTotal: snapshot.chunkTotal,
					})
				}
				await activeSession.client.uploadFile(input.currentPath, input.file, {
					chunkSizeBytes,
					retryCount: env.fileUploadTusRetryCount,
					thresholdBytes: env.fileUploadTusThresholdBytes,
					onProgress: (progress) => {
						if (!progress.chunkSize && progress.bytesUploaded < progress.bytesTotal) {
							return
						}
						const snapshot: UploadProgressSnapshot = {
							bytesUploaded: progress.bytesUploaded,
							bytesTotal: progress.bytesTotal,
							chunkIndex: Math.min(
								chunkTotal,
								progress.chunkSize
									? Math.ceil(progress.bytesUploaded / chunkSizeBytes)
									: Math.floor(progress.bytesUploaded / chunkSizeBytes),
							),
							chunkTotal,
						}
						publishProgress(snapshot)
					},
				})
				publishProgress({
					bytesUploaded: input.file.size,
					bytesTotal: input.file.size,
					chunkIndex: chunkTotal,
					chunkTotal,
				}, true)
				uploadActions.updateTask(id, {
					bytesUploaded: input.file.size,
					chunkIndex: chunkTotal,
					status: 'success',
				})
				return { path: joinPath(input.currentPath, input.file.name), taskID: id }
			}
			catch (error) {
				uploadActions.updateTask(id, {
					errorMessage: error instanceof Error ? error.message : 'Upload failed',
					status: 'failed',
				})
				throw error
			}
		},
		onSuccess: ({ path }) => {
			if (!session) {
				return
			}
			invalidateFileManagerAfterMutation(queryClient, session, [path])
		},
	})
}
