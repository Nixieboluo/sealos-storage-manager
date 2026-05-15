import { describe, expect, it } from 'vitest'

import { uploadActions, uploadStore } from '@/features/file-manager/stores/upload-store'

describe('uploadStore', () => {
	it('tracks upload task lifecycle in UI-only state', () => {
		uploadActions.reset()

		uploadActions.addTask({
			id: 'upload-1',
			fileName: 'large.bin',
			targetPath: '/',
			bytesUploaded: 0,
			bytesTotal: 100,
			status: 'uploading',
		})
		uploadActions.updateTask('upload-1', {
			bytesUploaded: 100,
			status: 'success',
		})

		expect(uploadStore.state.tasks[0]).toMatchObject({
			bytesUploaded: 100,
			status: 'success',
		})

		uploadActions.clearCompleted()

		expect(uploadStore.state.tasks).toEqual([])
	})
})
