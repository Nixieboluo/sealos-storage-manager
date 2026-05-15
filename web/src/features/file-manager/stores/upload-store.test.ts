import { describe, expect, it } from 'vitest'

import { hasActiveUploadsForSession, uploadActions, uploadStore } from '@/features/file-manager/stores/upload-store'

describe('uploadStore', () => {
	it('tracks upload task lifecycle in UI-only state', () => {
		uploadActions.reset()

		uploadActions.addTask({
			id: 'upload-1',
			fileName: 'large.bin',
			targetPath: '/',
			bytesUploaded: 0,
			bytesTotal: 100,
			pvcKey: 'pvc-1',
			viewerSessionID: 'vs-1',
			status: 'uploading',
		})
		expect(hasActiveUploadsForSession({ viewerSessionID: 'vs-1' })).toBe(true)
		uploadActions.updateTask('upload-1', {
			bytesUploaded: 100,
			status: 'success',
		})
		expect(hasActiveUploadsForSession({ viewerSessionID: 'vs-1' })).toBe(false)

		expect(uploadStore.state.tasks[0]).toMatchObject({
			bytesUploaded: 100,
			status: 'success',
		})

		uploadActions.clearCompleted()

		expect(uploadStore.state.tasks).toEqual([])
	})
})
