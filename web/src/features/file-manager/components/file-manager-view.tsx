import type { ColumnDef, SortingState } from '@tanstack/react-table'
import type { FileBrowserSession, FileEntry, FileTableRow } from '@/features/file-manager/types/file-manager'
import type { FileSortState } from '@/features/file-manager/utils/file-tree'
import type { SessionCapability } from '@/features/viewer/utils/session-capability'

import { joinPath, parentPath } from '@sealos-storage-manager/filebrowser-client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table'
import {
	ArrowLeft,
	ChevronDown,
	ChevronRight,
	Download,
	Edit3,
	File,
	Folder,
	FolderPlus,
	RefreshCw,
	Trash2,
	Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { env } from '@/config/env'
import { fileManagerKeys } from '@/features/file-manager/api/file-manager-query-keys'
import { fileListQueryOptions, fileTextQueryOptions } from '@/features/file-manager/api/file-manager-query-options'
import { moveToRecycleBin } from '@/features/file-manager/api/recycle-bin-api'
import { uploadActions, useUploadTasks } from '@/features/file-manager/stores/upload-store'
import {
	buildFileTableRows,
	flattenResources,
	isEditableFile,
	nextSortState,
	sortEntries,
} from '@/features/file-manager/utils/file-tree'
import { formatBytes } from '@/features/viewer/utils/format-capacity'

interface FileManagerViewProps {
	currentPath: string
	onBackToVolumes: () => void
	onPathChange: (path: string) => void
	onReconnect: (error?: unknown) => void
	onRefreshSession: () => void
	pvcName?: string
	session: FileBrowserSession | null
	sessionCapability: SessionCapability
	sort: FileSortState
	setSort: (sort: FileSortState) => void
}

interface BranchState {
	entries?: FileEntry[]
	error?: Error
	isLoading?: boolean
}

interface BranchTreeState {
	branches: Record<string, BranchState | undefined>
	expandedPaths: Set<string>
	scope: string
}

const emptyEntries: FileEntry[] = []
const emptyBranches: Record<string, BranchState | undefined> = {}
const emptyExpandedPaths = new Set<string>()

function createBranchTreeState(scope: string): BranchTreeState {
	return {
		branches: {},
		expandedPaths: new Set(),
		scope,
	}
}

export function FileManagerView({
	currentPath,
	onBackToVolumes,
	onPathChange,
	onReconnect,
	onRefreshSession,
	pvcName,
	session,
	sessionCapability,
	sort,
	setSort,
}: FileManagerViewProps) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const canShowFileList = sessionCapability.canShowFileList && session !== null
	const canUseFiles = sessionCapability.canUseFiles && session !== null
	const fileQuery = useQuery(fileListQueryOptions(session, currentPath, sort, canUseFiles))
	const entries = fileQuery.data?.entries ?? emptyEntries
	const tasks = useUploadTasks()
	const treeScope = `${session?.pvcKey ?? 'inactive'}:${currentPath}`
	const [treeState, setTreeState] = useState<BranchTreeState>(() => createBranchTreeState(treeScope))
	const expandedPaths = treeState.scope === treeScope ? treeState.expandedPaths : emptyExpandedPaths
	const branches = treeState.scope === treeScope ? treeState.branches : emptyBranches

	const operationsDisabled = !canUseFiles || fileQuery.isFetching || hasPendingBranches(branches)
	const showOverlay = canShowFileList && (fileQuery.isFetching || sessionCapability.kind === 'viewer-reconnecting')
	const visiblePath = fileQuery.data?.path ?? currentPath

	useEffect(() => {
		if (fileQuery.error) {
			onReconnect(fileQuery.error)
		}
	}, [fileQuery.error, onReconnect])

	const invalidateFiles = useCallback(() => {
		if (!session || !canUseFiles) {
			return
		}
		void queryClient.invalidateQueries({
			queryKey: fileManagerKeys.files(session.pvcKey, currentPath),
		})
		void queryClient.invalidateQueries({
			queryKey: fileManagerKeys.recycleBin(session.pvcKey),
		})
	}, [canUseFiles, currentPath, queryClient, session])

	const loadBranch = useCallback(async (entry: FileEntry) => {
		if (!session || !canUseFiles) {
			return
		}
		setTreeState((current) => {
			const scoped = current.scope === treeScope ? current : createBranchTreeState(treeScope)
			return {
				...scoped,
				branches: {
					...scoped.branches,
					[entry.path]: { isLoading: true },
				},
			}
		})
		try {
			const resource = await queryClient.fetchQuery(fileListQueryOptions(session, entry.path, sort, canUseFiles))
			setTreeState((current) => {
				const scoped = current.scope === treeScope ? current : createBranchTreeState(treeScope)
				return {
					...scoped,
					branches: {
						...scoped.branches,
						[entry.path]: {
							entries: sortEntries(
								flattenResources(resource.current, entry.depth + 1),
								sort,
							),
						},
					},
				}
			})
		}
		catch (caught) {
			const error = caught instanceof Error ? caught : new Error(t('errors.generic'))
			setTreeState((current) => {
				const scoped = current.scope === treeScope ? current : createBranchTreeState(treeScope)
				return {
					...scoped,
					branches: {
						...scoped.branches,
						[entry.path]: { error },
					},
				}
			})
			onReconnect(caught)
		}
	}, [canUseFiles, onReconnect, queryClient, session, sort, t, treeScope])

	const toggleFolder = useCallback(async (entry: FileEntry) => {
		if (!session || operationsDisabled) {
			return
		}

		const hasEntries = Boolean(branches[entry.path]?.entries)
		const shouldLoad = !expandedPaths.has(entry.path) && !hasEntries
		setTreeState((current) => {
			const scoped = current.scope === treeScope ? current : createBranchTreeState(treeScope)
			const next = new Set(scoped.expandedPaths)
			if (next.has(entry.path)) {
				next.delete(entry.path)
			}
			else {
				next.add(entry.path)
			}
			return {
				...scoped,
				expandedPaths: next,
			}
		})

		if (!shouldLoad) {
			return
		}

		await loadBranch(entry)
	}, [branches, expandedPaths, loadBranch, operationsDisabled, session, treeScope])

	const rows = useMemo(
		() => buildFileTableRows(entries, expandedPaths, branches),
		[branches, entries, expandedPaths],
	)

	const columns = useMemo<ColumnDef<FileTableRow>[]>(() => [
		{
			accessorFn: row => row.kind === 'resource' ? row.entry.name : row.path,
			cell: info => (
				<FileNameCell
					disabled={operationsDisabled}
					isExpanded={info.row.original.kind === 'resource' && expandedPaths.has(info.row.original.entry.path)}
					onRetryBranch={(path) => {
						const entry = rows.find(row => row.kind === 'resource' && row.entry.path === path)
						if (entry?.kind === 'resource') {
							void loadBranch(entry.entry)
						}
					}}
					onToggleFolder={entry => void toggleFolder(entry)}
					row={info.row.original}
				/>
			),
			header: () => (
				<SortableHead
					active={sort.field === 'name'}
					disabled={operationsDisabled}
					direction={sort.direction}
					label={t('files.columns.name')}
					onClick={() => setSort(nextSortState(sort, 'name'))}
				/>
			),
			id: 'name',
		},
		{
			accessorFn: row => row.kind === 'resource' ? row.entry.size : 0,
			cell: info => info.row.original.kind === 'resource'
				? info.row.original.entry.isDir ? '-' : formatBytes(info.row.original.entry.size)
				: '',
			header: () => (
				<SortableHead
					active={sort.field === 'size'}
					disabled={operationsDisabled}
					direction={sort.direction}
					label={t('files.columns.size')}
					onClick={() => setSort(nextSortState(sort, 'size'))}
				/>
			),
			id: 'size',
		},
		{
			accessorFn: row => row.kind === 'resource' ? row.entry.modified : '',
			cell: info => info.row.original.kind === 'resource' ? info.row.original.entry.modified || '-' : '',
			header: () => (
				<SortableHead
					active={sort.field === 'modified'}
					disabled={operationsDisabled}
					direction={sort.direction}
					label={t('files.columns.modified')}
					onClick={() => setSort(nextSortState(sort, 'modified'))}
				/>
			),
			id: 'modified',
		},
		{
			cell: info => info.row.original.kind === 'resource' && session
				? (
						<FileActions
							disabled={operationsDisabled}
							entry={info.row.original.entry}
							onDeleted={invalidateFiles}
							onOpenFolder={onPathChange}
							session={session}
						/>
					)
				: null,
			header: () => <span>{t('files.columns.actions')}</span>,
			id: 'actions',
		},
	], [expandedPaths, invalidateFiles, loadBranch, operationsDisabled, onPathChange, rows, session, setSort, sort, t, toggleFolder])

	const table = useReactTable({
		columns,
		data: rows,
		getCoreRowModel: getCoreRowModel(),
		getRowId: row => row.id,
		getSortedRowModel: getSortedRowModel(),
		manualSorting: true,
		state: {
			sorting: [{ desc: sort.direction === 'desc', id: sort.field }] satisfies SortingState,
		},
	})

	return (
		<section className="flex min-h-0 flex-1 flex-col gap-4">
			<header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				<div className="min-w-0">
					<h2 className="text-xl font-semibold">{t('files.title')}</h2>
					<p className="text-sm text-muted-foreground">
						{pvcName ? t('files.subtitle', { pvc: pvcName }) : t('files.noSelection')}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Button onClick={onBackToVolumes} size="sm" variant="outline">
						<ArrowLeft data-icon="inline-start" />
						{t('files.backToVolumes')}
					</Button>
					{canShowFileList
						? (
								<>
									<CreateFolderDialog
										currentPath={currentPath}
										disabled={operationsDisabled}
										onCreated={invalidateFiles}
										session={session}
									/>
									<UploadDialog
										currentPath={currentPath}
										disabled={operationsDisabled}
										onUploaded={invalidateFiles}
										session={session}
									/>
									<Button
										aria-label={t('actions.refresh')}
										disabled={!canUseFiles || operationsDisabled}
										onClick={() => {
											onRefreshSession()
											void fileQuery.refetch()
										}}
										size="icon"
										variant="outline"
									>
										<RefreshCw />
									</Button>
								</>
							)
						: null}
				</div>
			</header>
			<Separator />

			{!canShowFileList
				? (
						<div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
							{t(sessionCapability.messageKey)}
						</div>
					)
				: (
						<>
							<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
								<Button
									disabled={currentPath === '/' || operationsDisabled}
									onClick={() => onPathChange(parentPath(currentPath))}
									size="sm"
									variant="ghost"
								>
									<ArrowLeft data-icon="inline-start" />
									{t('files.up')}
								</Button>
								<span className="rounded-md border bg-muted px-2 py-1 font-mono text-xs text-foreground">
									{visiblePath}
								</span>
								{currentPath !== visiblePath
									? (
											<span className="rounded-md border bg-muted px-2 py-1 text-xs">
												{t('files.pendingPath', { path: currentPath })}
											</span>
										)
									: null}
								{!canUseFiles ? <span>{t(sessionCapability.messageKey)}</span> : null}
							</div>

							<div className="relative min-h-0 rounded-lg border bg-card">
								<Table>
									<TableHeader>
										{table.getHeaderGroups().map(headerGroup => (
											<TableRow key={headerGroup.id}>
												{headerGroup.headers.map(header => (
													<TableHead className={header.id === 'actions' ? 'text-right' : undefined} key={header.id}>
														{header.isPlaceholder
															? null
															: flexRender(header.column.columnDef.header, header.getContext())}
													</TableHead>
												))}
											</TableRow>
										))}
									</TableHeader>
									<TableBody>
										{fileQuery.isLoading && rows.length === 0
											? (
													<TableRow>
														<TableCell className="py-12 text-center text-muted-foreground" colSpan={4}>
															{t('files.pending')}
														</TableCell>
													</TableRow>
												)
											: null}
										{fileQuery.error && rows.length === 0
											? (
													<TableRow>
														<TableCell className="py-12 text-center text-destructive" colSpan={4}>
															<div className="flex flex-col items-center gap-3">
																<span>{fileQuery.error instanceof Error ? fileQuery.error.message : t('errors.generic')}</span>
																<Button onClick={() => void fileQuery.refetch()} size="sm" variant="outline">
																	{t('actions.retry')}
																</Button>
															</div>
														</TableCell>
													</TableRow>
												)
											: null}
										{table.getRowModel().rows.map(row => (
											<TableRow key={row.id}>
												{row.getVisibleCells().map(cell => (
													<TableCell className={cell.column.id === 'actions' ? 'text-right' : undefined} key={cell.id}>
														{flexRender(cell.column.columnDef.cell, cell.getContext())}
													</TableCell>
												))}
											</TableRow>
										))}
										{!fileQuery.isLoading && !fileQuery.error && rows.length === 0
											? (
													<TableRow>
														<TableCell className="py-12 text-center text-muted-foreground" colSpan={4}>
															{t('files.empty')}
														</TableCell>
													</TableRow>
												)
											: null}
									</TableBody>
								</Table>
								{showOverlay
									? (
											<div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/70 backdrop-blur-[1px]" role="status">
												<div className="rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
													{sessionCapability.kind === 'viewer-reconnecting'
														? t('files.reconnecting')
														: t('files.pending')}
												</div>
											</div>
										)
									: null}
							</div>
						</>
					)}

			{tasks.length > 0
				? (
						<div className="grid gap-2 rounded-lg border bg-card p-3">
							<div className="flex items-center justify-between gap-3">
								<div className="text-sm font-medium">{t('files.uploadTasks')}</div>
								<Button onClick={() => uploadActions.clearCompleted()} size="sm" variant="ghost">
									{t('files.clearCompleted')}
								</Button>
							</div>
							{tasks.map((task) => {
								const value = task.bytesTotal > 0
									? Math.round((task.bytesUploaded / task.bytesTotal) * 100)
									: 0
								return (
									<div className="grid gap-1" key={task.id}>
										<div className="flex items-center justify-between gap-3 text-xs">
											<span className="truncate">{task.fileName}</span>
											<span className="text-muted-foreground">{task.status}</span>
										</div>
										<Progress value={value} />
									</div>
								)
							})}
						</div>
					)
				: null}
		</section>
	)
}

interface SortableHeadProps {
	active: boolean
	direction: 'asc' | 'desc'
	disabled: boolean
	label: string
	onClick: () => void
}

function SortableHead({ active, direction, disabled, label, onClick }: SortableHeadProps) {
	return (
		<Button disabled={disabled} onClick={onClick} size="sm" variant="ghost">
			{label}
			{active ? <ChevronDown data-icon="inline-end" data-state={direction} /> : null}
		</Button>
	)
}

interface FileNameCellProps {
	disabled: boolean
	isExpanded: boolean
	onRetryBranch: (path: string) => void
	onToggleFolder: (entry: FileEntry) => void
	row: FileTableRow
}

function FileNameCell({
	disabled,
	isExpanded,
	onRetryBranch,
	onToggleFolder,
	row,
}: FileNameCellProps) {
	const { t } = useTranslation()

	if (row.kind === 'branch-loading') {
		return (
			<div className="flex min-w-0 items-center gap-2 text-muted-foreground" style={{ paddingLeft: `${row.depth * 16}px` }}>
				<span className="size-4" />
				<span>{t('files.pending')}</span>
			</div>
		)
	}

	if (row.kind === 'branch-error') {
		return (
			<div className="flex min-w-0 items-center gap-2 text-destructive" style={{ paddingLeft: `${row.depth * 16}px` }}>
				<span>{row.error.message}</span>
				<Button disabled={disabled} onClick={() => onRetryBranch(row.path)} size="sm" variant="outline">
					{t('files.retryFolder')}
				</Button>
			</div>
		)
	}

	const entry = row.entry
	return (
		<div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${entry.depth * 16}px` }}>
			{entry.isDir
				? (
						<Button
							aria-label={t('files.toggleFolder')}
							disabled={disabled}
							onClick={() => onToggleFolder(entry)}
							size="icon"
							variant="ghost"
						>
							{isExpanded ? <ChevronDown /> : <ChevronRight />}
						</Button>
					)
				: <span className="size-9" />}
			<div className="flex size-8 items-center justify-center rounded-md border bg-muted text-muted-foreground">
				{entry.isDir ? <Folder /> : <File />}
			</div>
			<div className="min-w-0">
				<div className="truncate font-medium">{entry.name}</div>
				<div className="truncate font-mono text-xs text-muted-foreground">{entry.path}</div>
			</div>
		</div>
	)
}

interface FileActionsProps {
	disabled: boolean
	entry: FileEntry
	onDeleted: () => void
	onOpenFolder: (path: string) => void
	session: FileBrowserSession
}

function FileActions({ disabled, entry, onDeleted, onOpenFolder, session }: FileActionsProps) {
	const { t } = useTranslation()
	const [editing, setEditing] = useState(false)
	const [deleting, setDeleting] = useState(false)
	const queryClient = useQueryClient()
	const textQuery = useQuery(fileTextQueryOptions(session, editing ? entry.path : null))
	const [editorContent, setEditorContent] = useState('')

	const saveMutation = useMutation({
		mutationFn: (content: string) => session.client.saveText(entry.path, content),
		onSuccess: () => {
			toast.success(t('files.saved'))
			void queryClient.invalidateQueries({ queryKey: fileManagerKeys.text(session.pvcKey, entry.path) })
			setEditing(false)
		},
		onError: error => toast.error(error instanceof Error ? error.message : t('errors.generic')),
	})

	const deleteMutation = useMutation({
		mutationFn: () => moveToRecycleBin(session.client, entry.path, entry.isDir, entry.size),
		onSuccess: () => {
			toast.success(t('trash.moved'))
			setDeleting(false)
			onDeleted()
		},
		onError: error => toast.error(error instanceof Error ? error.message : t('errors.generic')),
	})

	async function download() {
		try {
			const blob = await session.client.downloadBlob(entry.path)
			const href = URL.createObjectURL(blob)
			const anchor = document.createElement('a')
			anchor.href = href
			anchor.download = entry.name
			anchor.click()
			URL.revokeObjectURL(href)
		}
		catch (error) {
			toast.error(error instanceof Error ? error.message : t('errors.generic'))
		}
	}

	function openEditor() {
		setEditing(true)
		setEditorContent(textQuery.data ?? '')
	}

	return (
		<>
			<div className="flex justify-end gap-1">
				{entry.isDir
					? (
							<Button
								aria-label={t('files.openFolder')}
								disabled={disabled}
								onClick={() => onOpenFolder(entry.path)}
								size="icon"
								variant="ghost"
							>
								<ChevronRight />
							</Button>
						)
					: (
							<Button aria-label={t('files.download')} disabled={disabled} onClick={() => void download()} size="icon" variant="ghost">
								<Download />
							</Button>
						)}
				{!entry.isDir && isEditableFile(entry.path)
					? (
							<Button aria-label={t('files.edit')} disabled={disabled} onClick={openEditor} size="icon" variant="ghost">
								<Edit3 />
							</Button>
						)
					: null}
				<Button aria-label={t('actions.delete')} disabled={disabled} onClick={() => setDeleting(true)} size="icon" variant="ghost">
					<Trash2 />
				</Button>
			</div>

			<Dialog onOpenChange={setEditing} open={editing}>
				<DialogContent className="sm:max-w-3xl">
					<DialogHeader>
						<DialogTitle>{t('files.editorTitle')}</DialogTitle>
						<DialogDescription>{entry.name}</DialogDescription>
					</DialogHeader>
					<Textarea
						className="min-h-96 font-mono text-sm"
						onChange={event => setEditorContent(event.target.value)}
						value={editorContent}
					/>
					<DialogFooter>
						<Button onClick={() => setEditing(false)} type="button" variant="outline">
							{t('actions.cancel')}
						</Button>
						<Button
							disabled={saveMutation.isPending || textQuery.isLoading}
							onClick={() => saveMutation.mutate(editorContent || textQuery.data || '')}
							type="button"
						>
							{t('actions.save')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog onOpenChange={setDeleting} open={deleting}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('files.confirmDeleteTitle')}</DialogTitle>
						<DialogDescription>{t('files.confirmDeleteDescription', { name: entry.name })}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button onClick={() => setDeleting(false)} variant="outline">
							{t('actions.cancel')}
						</Button>
						<Button
							disabled={deleteMutation.isPending}
							onClick={() => deleteMutation.mutate()}
							variant="destructive"
						>
							{t('actions.delete')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}

interface DialogWithSessionProps {
	currentPath: string
	disabled: boolean
	onCreated?: () => void
	onUploaded?: () => void
	session: FileBrowserSession | null
}

function CreateFolderDialog({ currentPath, disabled, onCreated, session }: DialogWithSessionProps) {
	const { t } = useTranslation()
	const [open, setOpen] = useState(false)
	const [name, setName] = useState('')
	const mutation = useMutation({
		mutationFn: async () => {
			if (!session) {
				throw new Error('File Browser session is not ready')
			}
			await session.client.createFolder(joinPath(currentPath, name))
		},
		onSuccess: () => {
			toast.success(t('files.folderCreated'))
			setName('')
			setOpen(false)
			onCreated?.()
		},
		onError: error => toast.error(error instanceof Error ? error.message : t('errors.generic')),
	})

	return (
		<>
			<Button disabled={disabled} onClick={() => setOpen(true)} size="sm" variant="outline">
				<FolderPlus data-icon="inline-start" />
				{t('files.newFolder')}
			</Button>
			<Dialog onOpenChange={setOpen} open={open}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('files.newFolder')}</DialogTitle>
						<DialogDescription>{currentPath}</DialogDescription>
					</DialogHeader>
					<div className="grid gap-2">
						<Label htmlFor="folder-name">{t('files.folderName')}</Label>
						<Input
							id="folder-name"
							onChange={event => setName(event.target.value)}
							value={name}
						/>
					</div>
					<DialogFooter>
						<Button onClick={() => setOpen(false)} variant="outline">
							{t('actions.cancel')}
						</Button>
						<Button
							disabled={mutation.isPending || name.trim().length === 0}
							onClick={() => mutation.mutate()}
						>
							{t('actions.create')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}

function UploadDialog({ currentPath, disabled, onUploaded, session }: DialogWithSessionProps) {
	const { t } = useTranslation()
	const [open, setOpen] = useState(false)
	const [file, setFile] = useState<File | null>(null)
	const inputRef = useRef<HTMLInputElement | null>(null)
	const uploadTaskIDRef = useRef<string | null>(null)
	const mutation = useMutation({
		mutationFn: async () => {
			if (!session || !file) {
				throw new Error('File Browser session is not ready')
			}
			const id = `${Date.now()}-${file.name}`
			uploadTaskIDRef.current = id
			uploadActions.addTask({
				id,
				fileName: file.name,
				targetPath: currentPath,
				bytesUploaded: 0,
				bytesTotal: file.size,
				status: 'uploading',
			})
			await session.client.uploadFile(currentPath, file, {
				chunkSizeBytes: env.fileUploadTusChunkBytes,
				retryCount: env.fileUploadTusRetryCount,
				thresholdBytes: env.fileUploadTusThresholdBytes,
				onProgress: progress => uploadActions.updateTask(id, {
					bytesUploaded: progress.bytesUploaded,
					bytesTotal: progress.bytesTotal,
				}),
			})
			uploadActions.updateTask(id, {
				bytesUploaded: file.size,
				status: 'success',
			})
		},
		onSuccess: () => {
			toast.success(t('files.uploaded'))
			setFile(null)
			setOpen(false)
			onUploaded?.()
		},
		onError: (error) => {
			if (uploadTaskIDRef.current) {
				uploadActions.updateTask(uploadTaskIDRef.current, { status: 'failed' })
			}
			toast.error(error instanceof Error ? error.message : t('errors.generic'))
		},
	})

	return (
		<>
			<Button disabled={disabled} onClick={() => setOpen(true)} size="sm">
				<Upload data-icon="inline-start" />
				{t('files.upload')}
			</Button>
			<Dialog onOpenChange={setOpen} open={open}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('files.upload')}</DialogTitle>
						<DialogDescription>{currentPath}</DialogDescription>
					</DialogHeader>
					<input
						className="hidden"
						onChange={event => setFile(event.target.files?.[0] ?? null)}
						ref={inputRef}
						type="file"
					/>
					<div className="grid gap-3">
						<Button onClick={() => inputRef.current?.click()} type="button" variant="outline">
							{t('files.chooseFile')}
						</Button>
						{file
							? (
									<div className="rounded-md border bg-muted px-3 py-2 text-sm">
										{file.name}
										<span className="ml-2 text-muted-foreground">{formatBytes(file.size)}</span>
									</div>
								)
							: null}
					</div>
					<DialogFooter>
						<Button onClick={() => setOpen(false)} variant="outline">
							{t('actions.cancel')}
						</Button>
						<Button disabled={!file || mutation.isPending} onClick={() => mutation.mutate()}>
							{t('files.upload')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}

function hasPendingBranches(branches: Record<string, BranchState | undefined>) {
	return Object.values(branches).some(branch => branch?.isLoading)
}
