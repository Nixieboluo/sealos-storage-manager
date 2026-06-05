export function tableColumnClassName(id: string) {
	switch (id) {
		case 'actions':
			return 'w-36 text-right'
		case 'modified':
			return 'w-44'
		case 'size':
			return 'w-28'
		default:
			return 'min-w-0'
	}
}
