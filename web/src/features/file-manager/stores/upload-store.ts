import { useSelector } from '@tanstack/react-store'
import { createStore } from '@tanstack/store'

export type UploadTaskStatus = 'queued' | 'uploading' | 'success' | 'failed' | 'aborted'

export interface UploadTask {
	bytesTotal: number
	bytesUploaded: number
	chunkIndex?: number
	chunkSizeBytes?: number
	chunkTotal?: number
	errorMessage?: string
	fileName: string
	id: string
	podSessionID?: string
	pvcKey?: string
	status: UploadTaskStatus
	targetPath: string
	viewerSessionID?: string
}

export interface UploadState {
	tasks: UploadTask[]
}

export const uploadStore = createStore<UploadState>({ tasks: [] })

export const uploadActions = {
	addTask: (task: UploadTask) =>
		uploadStore.setState(state => ({ tasks: [task, ...state.tasks] })),
	clearCompleted: () =>
		uploadStore.setState(state => ({
			tasks: state.tasks.filter(task => task.status === 'uploading' || task.status === 'queued'),
		})),
	reset: () => uploadStore.setState(() => ({ tasks: [] })),
	updateTask: (id: string, patch: Partial<UploadTask>) =>
		uploadStore.setState(state => ({
			tasks: state.tasks.map(task => (task.id === id ? { ...task, ...patch } : task)),
		})),
}

function isActiveSessionUpload(task: UploadTask, input: {
	podSessionID?: string | null
	pvcKey?: string | null
	viewerSessionID?: string | null
}) {
	if (task.status !== 'queued' && task.status !== 'uploading') {
		return false
	}
	return (
		(Boolean(input.viewerSessionID) && task.viewerSessionID === input.viewerSessionID)
		|| (Boolean(input.podSessionID) && task.podSessionID === input.podSessionID)
		|| (Boolean(input.pvcKey) && task.pvcKey === input.pvcKey)
	)
}

export function hasActiveUploadsForSession(input: {
	podSessionID?: string | null
	pvcKey?: string | null
	viewerSessionID?: string | null
}) {
	return uploadStore.state.tasks.some(task => isActiveSessionUpload(task, input))
}

export function useUploadTasks() {
	return useSelector(uploadStore, state => state.tasks)
}

export function useUploadTask(taskID: string | null) {
	return useSelector(uploadStore, state => state.tasks.find(task => task.id === taskID))
}

export function useHasActiveUploadsForSession(input: {
	podSessionID?: string | null
	pvcKey?: string | null
	viewerSessionID?: string | null
}) {
	return useSelector(uploadStore, state => state.tasks.some(task => isActiveSessionUpload(task, input)))
}
