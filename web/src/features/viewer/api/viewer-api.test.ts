import { APIError, ErrCode } from '@sealos-storage-manager/encore-client'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createViewerApi, readAuthorizationHeader } from '@/features/viewer/api/viewer-api'
import { ViewerApiError } from '@/features/viewer/api/viewer-error'
import { pvcFixture, storageClassFixture, viewerSessionFixture } from '@/features/viewer/test/fakes'

describe('viewer API adapter', () => {
	afterEach(() => {
		window.localStorage.clear()
		vi.unstubAllEnvs()
	})

	it('reads configured authorization before local kubeconfig storage', () => {
		vi.stubEnv('VITE_VIEWER_AUTHORIZATION', 'Bearer configured')
		vi.stubEnv('VITE_DEV_KUBECONFIG', 'dev-kubeconfig')
		window.localStorage.setItem('sealos-storage-manager.kubeconfig', 'stored')

		expect(readAuthorizationHeader()).toBe('Bearer configured')
	})

	it('reads dev kubeconfig before local kubeconfig storage', () => {
		vi.stubEnv('VITE_DEV_KUBECONFIG', 'apiVersion: v1\nclusters: []')
		window.localStorage.setItem('sealos-storage-manager.kubeconfig', 'stored')

		expect(readAuthorizationHeader()).toBe('Bearer apiVersion%3A%20v1%0Aclusters%3A%20%5B%5D')
	})

	it('encodes stored kubeconfig authorization for the backend auth contract', () => {
		window.localStorage.setItem('sealos-storage-manager.kubeconfig', 'apiVersion: v1\nclusters: []')

		expect(readAuthorizationHeader()).toBe('Bearer apiVersion%3A%20v1%0Aclusters%3A%20%5B%5D')
	})

	it('throws a localized business error shape when authorization is missing', () => {
		expect(() => readAuthorizationHeader()).toThrow(ViewerApiError)
		expect(() => readAuthorizationHeader()).toThrow('Kubeconfig authorization is not configured')
	})

	it('unwraps Encore response envelopes through the generated client boundary', async () => {
		window.localStorage.setItem('sealos-storage-manager.kubeconfig', 'test-kubeconfig')
		const listPVCs = vi.fn().mockResolvedValue({
			pvc_list: { items: [pvcFixture({ name: 'mysql-data' })] },
		})
		const listStorageClasses = vi.fn().mockResolvedValue({
			storage_class_list: { items: [storageClassFixture({ name: 'standard' })] },
		})
		const createPVC = vi.fn().mockResolvedValue({
			pvc: pvcFixture({ name: 'cache-data' }),
		})
		const expandPVC = vi.fn().mockResolvedValue({
			pvc: pvcFixture({ capacity: '20Gi', capacity_bytes: 20 * 1024 * 1024 * 1024 }),
		})
		const deletePVC = vi.fn().mockResolvedValue({
			pvc: pvcFixture({ name: 'mysql-data' }),
		})
		const createViewerSession = vi.fn().mockResolvedValue({
			viewer_session: viewerSessionFixture({ id: 'vs_1' }),
		})
		const api = createViewerApi({
			viewer: {
				ListPVCs: listPVCs,
				ListStorageClasses: listStorageClasses,
				CreatePVC: createPVC,
				CreateViewerSession: createViewerSession,
				ExpandPVC: expandPVC,
				DeletePVC: deletePVC,
			},
		} as never)

		await expect(api.listPVCs({ namespace: 'default' })).resolves.toEqual([
			expect.objectContaining({ name: 'mysql-data' }),
		])
		await expect(api.createViewerSession({
			namespace: 'default',
			pvcName: 'mysql-data',
		})).resolves.toEqual(expect.objectContaining({ id: 'vs_1' }))
		await expect(api.listStorageClasses()).resolves.toEqual([
			expect.objectContaining({ name: 'standard' }),
		])
		await expect(api.createPVC({
			namespace: 'default',
			name: 'cache-data',
			capacity: '5Gi',
			capacityBytes: 5 * 1024 * 1024 * 1024,
			accessModes: ['ReadWriteOnce'],
			storageClassName: 'standard',
		})).resolves.toEqual(expect.objectContaining({ name: 'cache-data' }))
		await expect(api.expandPVC({
			namespace: 'default',
			name: 'mysql-data',
			capacity: '20Gi',
			capacityBytes: 20 * 1024 * 1024 * 1024,
		})).resolves.toEqual(expect.objectContaining({ capacity: '20Gi' }))
		await expect(api.deletePVC({
			namespace: 'default',
			name: 'mysql-data',
		})).resolves.toEqual(expect.objectContaining({ name: 'mysql-data' }))
		expect(listPVCs).toHaveBeenCalledWith({
			Authorization: 'Bearer test-kubeconfig',
			Namespace: 'default',
		})
		expect(createViewerSession).toHaveBeenCalledWith({
			Authorization: 'Bearer test-kubeconfig',
			namespace: 'default',
			pvc_name: 'mysql-data',
		})
		expect(listStorageClasses).toHaveBeenCalledWith({
			Authorization: 'Bearer test-kubeconfig',
		})
		expect(createPVC).toHaveBeenCalledWith({
			Authorization: 'Bearer test-kubeconfig',
			namespace: 'default',
			name: 'cache-data',
			capacity: '5Gi',
			capacity_bytes: 5 * 1024 * 1024 * 1024,
			access_modes: ['ReadWriteOnce'],
			storage_class_name: 'standard',
		})
		expect(expandPVC).toHaveBeenCalledWith('default', 'mysql-data', {
			Authorization: 'Bearer test-kubeconfig',
			capacity: '20Gi',
			capacity_bytes: 20 * 1024 * 1024 * 1024,
		})
		expect(deletePVC).toHaveBeenCalledWith('default', 'mysql-data', {
			Authorization: 'Bearer test-kubeconfig',
		})
	})

	it('normalizes Encore error detail codes to viewer business errors', async () => {
		window.localStorage.setItem('sealos-storage-manager.kubeconfig', 'test-kubeconfig')
		const api = createViewerApi({
			viewer: {
				ListPVCs: vi.fn().mockRejectedValue(new APIError(403, {
					code: ErrCode.PermissionDenied,
					details: { Code: 'PVC_ACCESS_DENIED' },
					message: 'denied',
				})),
			},
		} as never)

		await expect(api.listPVCs({ namespace: 'default' })).rejects.toMatchObject({
			code: 'PVC_ACCESS_DENIED',
			status: 403,
		})
	})
})
