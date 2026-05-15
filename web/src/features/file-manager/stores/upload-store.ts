import { useSelector } from '@tanstack/react-store'
import { createStore } from '@tanstack/store'

export type UploadTaskStatus = 'queued' | 'uploading' | 'success' | 'failed' | 'aborted'

export interface UploadTask {
	bytesTotal: number
	bytesUploaded: number
	fileName: string
	id: string
	status: UploadTaskStatus
	targetPath: string
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

export function useUploadTasks() {
	return useSelector(uploadStore, state => state.tasks)
}
