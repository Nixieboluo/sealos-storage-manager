export function normalizePath(path: string): string {
	const trimmed = path.trim()
	if (!trimmed || trimmed === '/') {
		return '/'
	}
	const segments = trimmed
		.split('/')
		.filter(Boolean)
		.map(segment => encodeURIComponent(segment))
	return `/${segments.join('/')}`
}

export function joinPath(parent: string, name: string): string {
	const base = normalizePath(parent)
	const child = name.split('/').filter(Boolean).join('/')
	if (!child) {
		return base
	}
	return normalizePath(base === '/' ? child : `${base}/${child}`)
}

export function parentPath(path: string): string {
	const normalized = normalizePath(path)
	if (normalized === '/') {
		return '/'
	}
	const index = normalized.lastIndexOf('/')
	return index <= 0 ? '/' : normalized.slice(0, index)
}
