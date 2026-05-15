import type { FileBrowserResource } from '@sealos-storage-manager/filebrowser-client'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import type { FileBrowserSession, FileEntry, FileListResult, FileTableRow } from '@/features/file-manager/types/file-manager'
import type { FileSortState } from '@/features/file-manager/utils/file-tree'
import type { SessionCapability } from '@/features/viewer/utils/session-capability'

import { parentPath } from '@sealos-storage-manager/filebrowser-client'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { invalidateFileTreeQueries } from '@/features/file-manager/api/file-manager-cache'
import {
	createFolderMutationOptions,
	createUploadTaskID,
	moveToRecycleBinMutationOptions,
	saveFileTextMutationOptions,
	uploadFileMutationOptions,
} from '@/features/file-manager/api/file-manager-mutations'
import { fileListQueryOptions, fileTextQueryOptions } from '@/features/file-manager/api/file-manager-query-options'
import { uploadActions, useUploadTask, useUploadTasks } from '@/features/file-manager/stores/upload-store'
import {
	buildFileTableRows,
	flattenResources,
	isEditableFile,
	nextSortState,
	sortEntries,
} from '@/features/file-manager/utils/file-tree'
import { formatBytes } from '@/features/viewer/utils/format-capacity'
import { cn } from '@/utils/cn'

interface FileManagerViewProps {
	currentPath: string
	onBackToVolumes: () => void
	onPathChange: (path: string) => void
	onReconnect: (error?: unknown) => void
	onRefreshSession: () => void
	podSessionID?: string | null
	pvcName?: string
	session: FileBrowserSession | null
	sessionCapability: SessionCapability
	sort: FileSortState
	setSort: (sort: FileSortState) => void
	viewerSessionID?: string | null
}

interface BranchState {
	entries?: FileEntry[]
	error?: Error
	isLoading?: boolean
}

interface BranchTreeState {
	expandedDepths: Record<string, number | undefined>
	scope: string
}

interface BranchQuerySnapshot {
	data?: FileBrowserResource
	error: Error | null
	isFetching: boolean
	isLoading: boolean
}

const emptyEntries: FileEntry[] = []
const emptyBranches: Record<string, BranchState | undefined> = {}
const emptyExpandedDepths: Record<string, number | undefined> = {}
const maxEditableFileBytes = 32 * 1024 * 1024
const MonacoEditor = lazy(() => import('@monaco-editor/react'))

function createBranchTreeState(scope: string): BranchTreeState {
	return {
		expandedDepths: {},
		scope,
	}
}

export function FileManagerView({
	currentPath,
	onBackToVolumes,
	onPathChange,
	onReconnect,
	onRefreshSession,
	podSessionID,
	pvcName,
	session,
	sessionCapability,
	sort,
	setSort,
	viewerSessionID,
}: FileManagerViewProps) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const canShowFileList = sessionCapability.canShowFileList && session !== null
	const canUseFiles = sessionCapability.canUseFiles && session !== null
	const fileQuery = useQuery(fileListQueryOptions(session, currentPath, sort, canUseFiles))
	const entries = fileQuery.data?.entries ?? emptyEntries
	const treeScope = `${session?.pvcKey ?? 'inactive'}:${currentPath}`
	const [treeState, setTreeState] = useState<BranchTreeState>(() => createBranchTreeState(treeScope))
	const expandedDepths = treeState.scope === treeScope ? treeState.expandedDepths : emptyExpandedDepths
	const expandedPathList = useMemo(() => Object.keys(expandedDepths), [expandedDepths])
	const expandedPaths = useMemo(() => new Set(expandedPathList), [expandedPathList])
	const branchQueryOptions = useMemo(
		() => expandedPathList.map(path => fileListQueryOptions(session, path, sort, canUseFiles)),
		[canUseFiles, expandedPathList, session, sort],
	)
	const branchQueries = useQueries({
		queries: branchQueryOptions,
		combine: useCallback((results: UseQueryResult<FileListResult, Error>[]) =>
			results.map((result): BranchQuerySnapshot => ({
				data: result.data?.current,
				error: result.error instanceof Error ? result.error : null,
				isFetching: result.isFetching,
				isLoading: result.isLoading,
			})), []),
	})
	const branches = useMemo(() => {
		if (expandedPathList.length === 0) {
			return emptyBranches
		}
		const nextBranches: Record<string, BranchState | undefined> = {}
		expandedPathList.forEach((path, index) => {
			const query = branchQueries[index]
			const depth = expandedDepths[path] ?? 0
			if (!query || query.isLoading || query.isFetching) {
				nextBranches[path] = { isLoading: true }
				return
			}
			if (query.error) {
				nextBranches[path] = { error: query.error }
				return
			}
			nextBranches[path] = {
				entries: query.data
					? sortEntries(flattenResources(query.data, depth + 1), sort)
					: [],
			}
		})
		return nextBranches
	}, [branchQueries, expandedDepths, expandedPathList, sort])

	const operationsDisabled = !canUseFiles || fileQuery.isFetching || hasPendingBranches(branches)
	const showOverlay = canShowFileList && (fileQuery.isFetching || sessionCapability.kind === 'viewer-reconnecting')
	const visiblePath = fileQuery.data?.path ?? currentPath

	useEffect(() => {
		if (fileQuery.error) {
			onReconnect(fileQuery.error)
		}
	}, [fileQuery.error, onReconnect])

	const toggleFolder = useCallback((entry: FileEntry) => {
		if (!session || operationsDisabled) {
			return
		}

		setTreeState((current) => {
			const scoped = current.scope === treeScope ? current : createBranchTreeState(treeScope)
			const next = { ...scoped.expandedDepths }
			if (next[entry.path] !== undefined) {
				delete next[entry.path]
			}
			else {
				next[entry.path] = entry.depth
			}
			return {
				...scoped,
				expandedDepths: next,
			}
		})
	}, [operationsDisabled, session, treeScope])

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
						if (session) {
							invalidateFileTreeQueries(queryClient, session, [path])
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
							onOpenFolder={onPathChange}
							session={session}
						/>
					)
				: null,
			header: () => <span>{t('files.columns.actions')}</span>,
			id: 'actions',
		},
	], [expandedPaths, operationsDisabled, onPathChange, queryClient, session, setSort, sort, t, toggleFolder])

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
										session={session}
									/>
									<UploadDialog
										currentPath={currentPath}
										disabled={operationsDisabled}
										podSessionID={podSessionID}
										session={session}
										viewerSessionID={viewerSessionID}
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

			<UploadTaskList />
		</section>
	)
}

function UploadTaskList() {
	const { t } = useTranslation()
	const tasks = useUploadTasks()

	if (tasks.length === 0) {
		return null
	}

	return (
		<div className="grid gap-2 rounded-lg border bg-card p-3">
			<div className="flex items-center justify-between gap-3">
				<div className="text-sm font-medium">{t('files.uploadTasks')}</div>
				<Button onClick={() => uploadActions.clearCompleted()} size="sm" variant="ghost">
					{t('files.clearCompleted')}
				</Button>
			</div>
			{tasks.map(task => (
				<UploadTaskRow key={task.id} taskID={task.id} />
			))}
		</div>
	)
}

interface UploadTaskRowProps {
	taskID: string
}

function UploadTaskRow({ taskID }: UploadTaskRowProps) {
	const task = useUploadTask(taskID)
	if (!task) {
		return null
	}
	const value = task.bytesTotal > 0
		? Math.round((task.bytesUploaded / task.bytesTotal) * 100)
		: 0

	return (
		<div className="grid gap-1">
			<div className="flex items-center justify-between gap-3 text-xs">
				<span className="truncate">{task.fileName}</span>
				<span className="text-muted-foreground">{task.status}</span>
			</div>
			<Progress
				className={cn(task.status === 'failed' && 'bg-destructive/20 [&_[data-slot=progress-indicator]]:bg-destructive')}
				value={value}
			/>
		</div>
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
	onOpenFolder: (path: string) => void
	session: FileBrowserSession
}

function FileActions({ disabled, entry, onOpenFolder, session }: FileActionsProps) {
	const { t } = useTranslation()
	const [editing, setEditing] = useState(false)
	const [deleting, setDeleting] = useState(false)
	const queryClient = useQueryClient()
	const textQuery = useQuery(fileTextQueryOptions(session, editing ? entry.path : null))
	const [editorContent, setEditorContent] = useState('')
	const [isEditorDirty, setIsEditorDirty] = useState(false)
	const saveMutation = useMutation(saveFileTextMutationOptions(queryClient, session))
	const deleteMutation = useMutation(moveToRecycleBinMutationOptions(queryClient, session))
	const editorValue = isEditorDirty ? editorContent : (textQuery.data ?? editorContent)

	const saveFile = useCallback(() => {
		saveMutation.mutate({
			content: editorValue,
			path: entry.path,
		}, {
			onSuccess: () => {
				toast.success(t('files.saved'))
				setEditing(false)
			},
			onError: error => toast.error(error instanceof Error ? error.message : t('errors.generic')),
		})
	}, [editorValue, entry.path, saveMutation, t])

	const deleteFile = useCallback(() => {
		deleteMutation.mutate({
			isDir: entry.isDir,
			path: entry.path,
			size: entry.size,
		}, {
			onSuccess: () => {
				toast.success(t('trash.moved'))
				setDeleting(false)
			},
			onError: error => toast.error(error instanceof Error ? error.message : t('errors.generic')),
		})
	}, [deleteMutation, entry.isDir, entry.path, entry.size, t])

	function download() {
		const anchor = document.createElement('a')
		anchor.href = session.client.downloadUrl(entry.path)
		anchor.download = entry.name
		anchor.rel = 'noreferrer'
		anchor.click()
	}

	function openEditor() {
		if (entry.size > maxEditableFileBytes) {
			toast.error(t('files.editorTooLarge', { size: formatBytes(maxEditableFileBytes) }))
			return
		}
		setEditing(true)
		setEditorContent(textQuery.data ?? '')
		setIsEditorDirty(false)
	}

	const isSaving = saveMutation.isPending
	const canEdit = !entry.isDir && isEditableFile(entry.path)

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
							<Button aria-label={t('files.download')} disabled={disabled} onClick={download} size="icon" variant="ghost">
								<Download />
							</Button>
						)}
				{canEdit
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

			<Dialog onOpenChange={open => !isSaving && setEditing(open)} open={editing}>
				<DialogContent className="sm:max-w-4xl" showCloseButton={!isSaving}>
					<DialogHeader>
						<DialogTitle>{t('files.editorTitle')}</DialogTitle>
						<DialogDescription>{entry.name}</DialogDescription>
					</DialogHeader>
					{isSaving
						? (
								<ModalStatus
									description={t('files.savingDescription')}
									title={t('files.savingTitle')}
								/>
							)
						: null}
					<div className="overflow-hidden rounded-md border">
						{!textQuery.isError
							? (
									<Suspense fallback={<div className="p-4 text-sm text-muted-foreground">{t('common.loading')}</div>}>
										<MonacoEditor
											height="28rem"
											language={editorLanguage(entry.path)}
											loading={t('common.loading')}
											onChange={(value) => {
												setEditorContent(value ?? '')
												setIsEditorDirty(true)
											}}
											options={{
												fontSize: 13,
												minimap: { enabled: false },
												readOnly: isSaving || textQuery.isLoading,
												scrollBeyondLastLine: false,
												wordWrap: 'on',
											}}
											value={textQuery.isLoading ? '' : editorValue}
										/>
									</Suspense>
								)
							: (
									<div className="p-4 text-sm text-destructive">
										{textQuery.error instanceof Error ? textQuery.error.message : t('errors.generic')}
									</div>
								)}
					</div>
					<DialogFooter>
						<Button disabled={isSaving} onClick={() => setEditing(false)} type="button" variant="outline">
							{t('actions.cancel')}
						</Button>
						<Button
							disabled={isSaving || textQuery.isLoading || textQuery.isError}
							onClick={saveFile}
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
							onClick={deleteFile}
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
	podSessionID?: string | null
	session: FileBrowserSession | null
	viewerSessionID?: string | null
}

function CreateFolderDialog({ currentPath, disabled, session }: DialogWithSessionProps) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const [open, setOpen] = useState(false)
	const [name, setName] = useState('')
	const mutation = useMutation(createFolderMutationOptions(queryClient, session))

	const createFolder = useCallback(() => {
		mutation.mutate({
			currentPath,
			name,
		}, {
			onSuccess: () => {
				toast.success(t('files.folderCreated'))
				setName('')
				setOpen(false)
			},
			onError: error => toast.error(error instanceof Error ? error.message : t('errors.generic')),
		})
	}, [currentPath, mutation, name, t])

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
							onClick={createFolder}
						>
							{t('actions.create')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}

function UploadDialog({
	currentPath,
	disabled,
	podSessionID,
	session,
	viewerSessionID,
}: DialogWithSessionProps) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const [open, setOpen] = useState(false)
	const [file, setFile] = useState<File | null>(null)
	const [activeTaskID, setActiveTaskID] = useState<string | null>(null)
	const inputRef = useRef<HTMLInputElement | null>(null)
	const mutation = useMutation(uploadFileMutationOptions(queryClient, session))
	const activeTask = useUploadTask(activeTaskID)
	const isUploading = mutation.isPending
	const uploadProgress = activeTask && activeTask.bytesTotal > 0
		? Math.round((activeTask.bytesUploaded / activeTask.bytesTotal) * 100)
		: 0
	const chunkLabel = activeTask?.chunkTotal
		? t('files.uploadChunks', {
				current: activeTask.chunkIndex ?? 0,
				total: activeTask.chunkTotal,
			})
		: t('files.uploadPreparing')

	const resetDialogState = useCallback(() => {
		setFile(null)
		setActiveTaskID(null)
		if (inputRef.current) {
			inputRef.current.value = ''
		}
	}, [])

	const openUploadDialog = useCallback(() => {
		resetDialogState()
		setOpen(true)
	}, [resetDialogState])

	const uploadFile = useCallback(() => {
		if (!file) {
			return
		}
		const taskID = createUploadTaskID(file.name)
		setActiveTaskID(taskID)
		mutation.mutate({
			currentPath,
			file,
			podSessionID: podSessionID ?? undefined,
			taskID,
			viewerSessionID: viewerSessionID ?? undefined,
		}, {
			onSuccess: () => {
				toast.success(t('files.uploaded'))
				resetDialogState()
				setOpen(false)
			},
			onError: error => toast.error(error instanceof Error ? error.message : t('errors.generic')),
		})
	}, [currentPath, file, mutation, podSessionID, resetDialogState, t, viewerSessionID])

	return (
		<>
			<Button disabled={disabled} onClick={openUploadDialog} size="sm">
				<Upload data-icon="inline-start" />
				{t('files.upload')}
			</Button>
			<Dialog
				onOpenChange={(nextOpen) => {
					if (isUploading) {
						return
					}
					setOpen(nextOpen)
					if (!nextOpen) {
						resetDialogState()
					}
				}}
				open={open}
			>
				<DialogContent showCloseButton={!isUploading}>
					<DialogHeader>
						<DialogTitle>{t('files.upload')}</DialogTitle>
						<DialogDescription>{currentPath}</DialogDescription>
					</DialogHeader>
					{isUploading
						? (
								<ModalStatus
									description={t('files.uploadingDescription')}
									title={t('files.uploadingTitle')}
								/>
							)
						: null}
					<input
						className="hidden"
						disabled={isUploading}
						onChange={event => setFile(event.target.files?.[0] ?? null)}
						ref={inputRef}
						type="file"
					/>
					<div className="grid gap-3">
						<Button disabled={isUploading} onClick={() => inputRef.current?.click()} type="button" variant="outline">
							{t('files.chooseFile')}
						</Button>
						{file
							? (
									<div className="grid gap-2 rounded-md border bg-muted px-3 py-2 text-sm">
										<div>
											{file.name}
											<span className="ml-2 text-muted-foreground">{formatBytes(file.size)}</span>
										</div>
										{isUploading || activeTask?.status === 'failed'
											? (
													<div className="grid gap-1">
														<Progress
															className={cn(activeTask?.status === 'failed' && 'bg-destructive/20 [&_[data-slot=progress-indicator]]:bg-destructive')}
															value={uploadProgress}
														/>
														<div className="flex justify-between gap-3 text-xs text-muted-foreground">
															<span>{activeTask?.status === 'failed' ? t('status.failed') : chunkLabel}</span>
															<span>
																{formatBytes(activeTask?.bytesUploaded ?? 0)}
																{' / '}
																{formatBytes(activeTask?.bytesTotal ?? file.size)}
															</span>
														</div>
														{activeTask?.errorMessage
															? <div className="text-xs text-destructive">{activeTask.errorMessage}</div>
															: null}
													</div>
												)
											: null}
									</div>
								)
							: null}
					</div>
					<DialogFooter>
						<Button disabled={isUploading} onClick={() => setOpen(false)} variant="outline">
							{t('actions.cancel')}
						</Button>
						<Button disabled={!file || isUploading} onClick={uploadFile}>
							{t('files.upload')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}

interface ModalStatusProps {
	description: string
	title: string
}

function ModalStatus({ description, title }: ModalStatusProps) {
	return (
		<div className="rounded-md border bg-muted px-3 py-2 text-sm" role="status">
			<div className="font-medium">{title}</div>
			<div className="text-muted-foreground">{description}</div>
		</div>
	)
}

function editorLanguage(path: string) {
	const extension = path.split('.').pop()?.toLowerCase()
	switch (extension) {
		case 'css':
			return 'css'
		case 'html':
			return 'html'
		case 'js':
		case 'jsx':
			return 'javascript'
		case 'json':
			return 'json'
		case 'md':
			return 'markdown'
		case 'ts':
		case 'tsx':
			return 'typescript'
		case 'xml':
			return 'xml'
		case 'yaml':
		case 'yml':
			return 'yaml'
		default:
			return 'plaintext'
	}
}

function hasPendingBranches(branches: Record<string, BranchState | undefined>) {
	return Object.values(branches).some(branch => branch?.isLoading)
}
