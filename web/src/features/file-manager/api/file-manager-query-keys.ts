export const fileManagerKeys = {
	all: ['file-manager'] as const,
	files: (pvcKey: string, path: string) =>
		[...fileManagerKeys.all, pvcKey, 'files', path] as const,
	recycleBin: (pvcKey: string) =>
		[...fileManagerKeys.all, pvcKey, 'recycle-bin'] as const,
	text: (pvcKey: string, path: string) =>
		[...fileManagerKeys.all, pvcKey, 'text', path] as const,
}
