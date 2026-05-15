import type { FileBrowserSession, FileEntry } from '@/features/file-manager/types/file-manager'

import type { FileSortState } from '@/features/file-manager/utils/file-tree'
import { joinPath, parentPath } from '@sealos-storage-manager/filebrowser-client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { useRef, useState } from 'react'
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

	isEditableFile,
	nextSortState,
} from '@/features/file-manager/utils/file-tree'
import { formatBytes } from '@/features/viewer/utils/format-capacity'

interface FileManagerViewProps {
	currentPath: string
	onBackToVolumes: () => void
	onPathChange: (path: string) => void
	onRefreshSession: () => void
	pvcName?: string
	session: FileBrowserSession | null
	sessionStatus: string
	sort: FileSortState
	setSort: (sort: FileSortState) => void
}

export function FileManagerView({
	currentPath,
	onBackToVolumes,
	onPathChange,
	onRefreshSession,
	pvcName,
	session,
	sessionStatus,
	sort,
	setSort,
}: FileManagerViewProps) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const fileQuery = useQuery(fileListQueryOptions(session, currentPath, sort))
	const entries = fileQuery.data?.entries ?? []
	const canUseFiles = session !== null
	const tasks = useUploadTasks()

	function invalidateFiles() {
		if (!session) {
			return
		}
		void queryClient.invalidateQueries({
			queryKey: fileManagerKeys.files(session.pvcKey, currentPath),
		})
		void queryClient.invalidateQueries({
			queryKey: fileManagerKeys.recycleBin(session.pvcKey),
		})
	}

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
					<CreateFolderDialog
						currentPath={currentPath}
						disabled={!canUseFiles}
						onCreated={invalidateFiles}
						session={session}
					/>
					<UploadDialog
						currentPath={currentPath}
						disabled={!canUseFiles}
						onUploaded={invalidateFiles}
						session={session}
					/>
					<Button
						aria-label={t('actions.refresh')}
						disabled={!canUseFiles}
						onClick={() => {
							onRefreshSession()
							void fileQuery.refetch()
						}}
						size="icon"
						variant="outline"
					>
						<RefreshCw />
					</Button>
				</div>
			</header>
			<Separator />

			<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
				<Button
					disabled={currentPath === '/' || !canUseFiles}
					onClick={() => onPathChange(parentPath(currentPath))}
					size="sm"
					variant="ghost"
				>
					<ArrowLeft data-icon="inline-start" />
					{t('files.up')}
				</Button>
				<span className="rounded-md border bg-muted px-2 py-1 font-mono text-xs text-foreground">
					{currentPath}
				</span>
				{sessionStatus !== 'ready'
					? <span>{t('files.preparingViewer')}</span>
					: null}
			</div>

			<div className="min-h-0 rounded-lg border bg-card">
				<Table>
					<TableHeader>
						<TableRow>
							<SortableHead
								active={sort.field === 'name'}
								direction={sort.direction}
								label={t('files.columns.name')}
								onClick={() => setSort(nextSortState(sort, 'name'))}
							/>
							<SortableHead
								active={sort.field === 'size'}
								direction={sort.direction}
								label={t('files.columns.size')}
								onClick={() => setSort(nextSortState(sort, 'size'))}
							/>
							<SortableHead
								active={sort.field === 'modified'}
								direction={sort.direction}
								label={t('files.columns.modified')}
								onClick={() => setSort(nextSortState(sort, 'modified'))}
							/>
							<TableHead className="text-right">{t('files.columns.actions')}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{fileQuery.isLoading || !canUseFiles
							? (
									<TableRow>
										<TableCell className="py-12 text-center text-muted-foreground" colSpan={4}>
											{canUseFiles ? t('common.loading') : t('files.preparingViewer')}
										</TableCell>
									</TableRow>
								)
							: null}
						{fileQuery.error
							? (
									<TableRow>
										<TableCell className="py-12 text-center text-destructive" colSpan={4}>
											{fileQuery.error instanceof Error ? fileQuery.error.message : t('errors.generic')}
										</TableCell>
									</TableRow>
								)
							: null}
						{!fileQuery.isLoading && !fileQuery.error && canUseFiles
							? entries.map(entry => (
									<FileRow
										entry={entry}
										key={entry.path}
										onDeleted={invalidateFiles}
										onOpenFolder={onPathChange}
										session={session}
									/>
								))
							: null}
						{!fileQuery.isLoading && !fileQuery.error && canUseFiles && entries.length === 0
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
			</div>

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
	label: string
	onClick: () => void
}

function SortableHead({ active, direction, label, onClick }: SortableHeadProps) {
	return (
		<TableHead>
			<Button onClick={onClick} size="sm" variant="ghost">
				{label}
				{active
					? <ChevronDown data-icon="inline-end" data-state={direction} />
					: null}
			</Button>
		</TableHead>
	)
}

interface FileRowProps {
	entry: FileEntry
	onDeleted: () => void
	onOpenFolder: (path: string) => void
	session: FileBrowserSession
}

function FileRow({ entry, onDeleted, onOpenFolder, session }: FileRowProps) {
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
			<TableRow
				onDoubleClick={() => {
					if (entry.isDir) {
						onOpenFolder(entry.path)
					}
				}}
			>
				<TableCell>
					<div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${entry.depth * 16}px` }}>
						{entry.isDir ? <ChevronRight /> : <span className="size-4" />}
						<div className="flex size-8 items-center justify-center rounded-md border bg-muted text-muted-foreground">
							{entry.isDir ? <Folder /> : <File />}
						</div>
						<div className="min-w-0">
							<div className="truncate font-medium">{entry.name}</div>
							<div className="truncate font-mono text-xs text-muted-foreground">{entry.path}</div>
						</div>
					</div>
				</TableCell>
				<TableCell>{entry.isDir ? '-' : formatBytes(entry.size)}</TableCell>
				<TableCell>{entry.modified || '-'}</TableCell>
				<TableCell>
					<div className="flex justify-end gap-1">
						{entry.isDir
							? (
									<Button
										aria-label={t('files.openFolder')}
										onClick={() => onOpenFolder(entry.path)}
										size="icon"
										variant="ghost"
									>
										<ChevronRight />
									</Button>
								)
							: (
									<Button aria-label={t('files.download')} onClick={() => void download()} size="icon" variant="ghost">
										<Download />
									</Button>
								)}
						{!entry.isDir && isEditableFile(entry.path)
							? (
									<Button aria-label={t('files.edit')} onClick={openEditor} size="icon" variant="ghost">
										<Edit3 />
									</Button>
								)
							: null}
						<Button aria-label={t('actions.delete')} onClick={() => setDeleting(true)} size="icon" variant="ghost">
							<Trash2 />
						</Button>
					</div>
				</TableCell>
			</TableRow>

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
