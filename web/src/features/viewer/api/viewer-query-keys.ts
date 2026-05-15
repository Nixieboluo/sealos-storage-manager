export const viewerKeys = {
	all: ['viewer'] as const,
	context: () => [...viewerKeys.all, 'context'] as const,
	mutations: {
		closePodSession: () => [...viewerKeys.all, 'mutation', 'close-pod-session'] as const,
		closeViewerSession: () => [...viewerKeys.all, 'mutation', 'close-viewer-session'] as const,
		createPVC: () => [...viewerKeys.all, 'mutation', 'create-pvc'] as const,
		createViewerSession: () => [...viewerKeys.all, 'mutation', 'create-viewer-session'] as const,
		deletePVC: () => [...viewerKeys.all, 'mutation', 'delete-pvc'] as const,
		expandPVC: () => [...viewerKeys.all, 'mutation', 'expand-pvc'] as const,
		heartbeatViewerSession: () => [...viewerKeys.all, 'mutation', 'heartbeat-viewer-session'] as const,
		issueViewerToken: () => [...viewerKeys.all, 'mutation', 'issue-viewer-token'] as const,
	},
	podSession: (podSessionID: string) =>
		[...viewerKeys.all, 'pod-session', podSessionID] as const,
	pvcs: (namespace: string) => [...viewerKeys.all, 'pvcs', namespace] as const,
	storageClasses: () => [...viewerKeys.all, 'storage-classes'] as const,
	viewerSession: (viewerSessionID: string) =>
		[...viewerKeys.all, 'viewer-session', viewerSessionID] as const,
	viewerToken: (viewerSessionID: string) =>
		[...viewerKeys.all, 'viewer-token', viewerSessionID] as const,
}
