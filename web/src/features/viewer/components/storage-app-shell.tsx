import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import type { FileBrowserSession } from '@/features/file-manager/types/file-manager'
import type { FileSortState } from '@/features/file-manager/utils/file-tree'

import type { ViewerView } from '@/features/viewer/stores/viewer-ui-store'
import type { PVC, StorageClass, ViewerAPI, ViewerToken } from '@/features/viewer/types/viewer'
import { FileBrowserClient } from '@sealos-storage-manager/filebrowser-client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
	Database,
	FolderOpen,
	HardDrive,
	Languages,
	MoreHorizontal,
	Plus,
	RefreshCw,
	Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileManagerView } from '@/features/file-manager/components/file-manager-view'
import { RecycleBinView } from '@/features/file-manager/components/recycle-bin-view'
import { trashRootPath } from '@/features/file-manager/utils/file-tree'
import { viewerApi } from '@/features/viewer/api/viewer-api'
import { translateViewerError } from '@/features/viewer/api/viewer-error'
import {
	createPVCMutationOptions,
	deletePVCMutationOptions,
	expandPVCMutationOptions,
} from '@/features/viewer/api/viewer-mutations'
import { pvcListQueryOptions, storageClassListQueryOptions } from '@/features/viewer/api/viewer-query-options'
import { ErrorCallout } from '@/features/viewer/components/error-callout'
import { PVCListSkeleton } from '@/features/viewer/components/loading-skeletons'
import { NamespaceFilter } from '@/features/viewer/components/namespace-filter'
import { PVCStatusBadge } from '@/features/viewer/components/pvc-status-badge'
import { ViewerLaunchPanel } from '@/features/viewer/components/viewer-launch-panel'
import { useViewerNamespace, useViewerSearch, useViewerView, viewerUIStore } from '@/features/viewer/stores/viewer-ui-store'
import { formatBytes } from '@/features/viewer/utils/format-capacity'
import { canLaunchViewer } from '@/features/viewer/utils/viewer-status'

interface StorageAppShellProps {
	api?: ViewerAPI
}

interface CreatePVCForm {
	accessMode: string
	capacityGi: number
	name: string
	namespace: string
	storageClassName: string
}

interface CreatePVCVariables {
	accessModes: string[]
	capacity: string
	capacityBytes: number
	name: string
	namespace: string
	storageClassName?: string
}

interface ExpandPVCVariables {
	capacity: string
	capacityBytes: number
	name: string
	namespace: string
}

interface DeletePVCVariables {
	name: string
	namespace: string
}

interface DeletePVCState {
	confirmName: string
	pvc: PVC
}

export function StorageAppShell({ api = viewerApi }: StorageAppShellProps) {
	const namespace = useViewerNamespace()
	const view = useViewerView()
	const queryClient = useQueryClient()
	const [launchKey, setLaunchKey] = useState<string | null>(null)
	const [selectedPVC, setSelectedPVC] = useState<PVC | null>(null)
	const [token, setToken] = useState<ViewerToken | null>(null)
	const [sessionStatus, setSessionStatus] = useState('idle')
	const [currentPath, setCurrentPath] = useState('/')
	const [sort, setSort] = useState<FileSortState>({ field: 'name', direction: 'asc' })
	const [createOpen, setCreateOpen] = useState(false)
	const [expandPVC, setExpandPVC] = useState<PVC | null>(null)
	const [deleteState, setDeleteState] = useState<DeletePVCState | null>(null)
	const { i18n, t } = useTranslation()

	const pvcQuery = useQuery(pvcListQueryOptions(namespace, api))
	const storageClassesQuery = useQuery(storageClassListQueryOptions(api))
	const pvcs = useMemo(() => pvcQuery.data ?? [], [pvcQuery.data])
	const namespaces = useMemo(() => {
		const values = new Set(['default', namespace])
		for (const pvc of pvcs) {
			values.add(pvc.namespace)
		}
		return [...values].sort()
	}, [namespace, pvcs])
	const fileSession = useMemo<FileBrowserSession | null>(() => {
		if (!token || !selectedPVC) {
			return null
		}
		return {
			client: new FileBrowserClient({
				baseUrl: token.viewer_url,
				token: token.token,
			}),
			pvcKey: selectedPVC.uid,
		}
	}, [selectedPVC, token])

	const createPVC = useMutation(createPVCMutationOptions(queryClient, api))
	const expandPVCMutation = useMutation(expandPVCMutationOptions(queryClient, api))
	const deletePVC = useMutation(deletePVCMutationOptions(queryClient, api))

	function openFiles(pvc: PVC) {
		setSelectedPVC(pvc)
		setToken(null)
		setCurrentPath('/')
		setLaunchKey(`${pvc.uid}:${Date.now()}`)
		viewerUIStore.actions.selectPVC({
			namespace: pvc.namespace,
			pvcName: pvc.name,
			uid: pvc.uid,
		})
	}

	function refreshActiveSession() {
		if (!selectedPVC) {
			return
		}
		setLaunchKey(`${selectedPVC.uid}:${Date.now()}`)
	}

	return (
		<main className="min-h-screen bg-muted/30 text-foreground">
			<div className="flex min-h-screen">
				<aside className="hidden w-64 shrink-0 border-r bg-sidebar px-4 py-5 text-sidebar-foreground lg:flex lg:flex-col">
					<div className="flex items-center gap-3 px-2">
						<div className="flex size-10 items-center justify-center rounded-lg border bg-background text-foreground">
							<Database />
						</div>
						<div className="min-w-0">
							<h1 className="truncate text-base font-semibold">{t('app.name')}</h1>
							<p className="text-xs text-muted-foreground">{t('app.subtitle')}</p>
						</div>
					</div>
					<nav className="mt-8 flex flex-col gap-2">
						<SidebarButton icon={<HardDrive />} label={t('nav.volumes')} value="volumes" view={view} />
						<SidebarButton icon={<FolderOpen />} label={t('nav.files')} value="files" view={view} />
						<SidebarButton icon={<Trash2 />} label={t('nav.trash')} value="trash" view={view} />
					</nav>
				</aside>

				<div className="flex min-w-0 flex-1 flex-col">
					<header className="flex flex-col gap-4 border-b bg-background px-4 py-4 md:flex-row md:items-center md:justify-between">
						<div className="flex min-w-0 items-center gap-3 lg:hidden">
							<div className="flex size-10 items-center justify-center rounded-lg border bg-muted">
								<Database />
							</div>
							<div className="min-w-0">
								<h1 className="text-xl font-semibold">{t('app.name')}</h1>
								<p className="text-sm text-muted-foreground">{t('app.subtitle')}</p>
							</div>
						</div>
						<Tabs
							className="lg:hidden"
							onValueChange={value => viewerUIStore.actions.setView(value as ViewerView)}
							value={view}
						>
							<TabsList>
								<TabsTrigger value="volumes">{t('nav.volumes')}</TabsTrigger>
								<TabsTrigger value="files">{t('nav.files')}</TabsTrigger>
								<TabsTrigger value="trash">{t('nav.trash')}</TabsTrigger>
							</TabsList>
						</Tabs>
						<div className="flex flex-col gap-2 md:ml-auto md:flex-row md:items-center">
							<NamespaceFilter namespaces={namespaces} />
							<Button
								aria-label={t('actions.refresh')}
								onClick={() => void pvcQuery.refetch()}
								size="icon"
								variant="outline"
							>
								<RefreshCw />
							</Button>
							<Button
								aria-label="Locale"
								onClick={() => {
									const next = i18n.language === 'zh' ? 'en' : 'zh'
									void i18n.changeLanguage(next)
									viewerUIStore.actions.setLocale(next)
								}}
								size="icon"
								variant="outline"
							>
								<Languages />
							</Button>
						</div>
					</header>

					<div className="min-h-0 flex-1 px-4 py-4">
						<Tabs
							className="h-full"
							onValueChange={value => viewerUIStore.actions.setView(value as ViewerView)}
							value={view}
						>
							<TabsContent className="m-0 flex h-full flex-col gap-4" value="volumes">
								<VolumesView
									createOpen={createOpen}
									onCreateOpenChange={setCreateOpen}
									onDelete={pvc => setDeleteState({ pvc, confirmName: '' })}
									onExpand={setExpandPVC}
									onOpenFiles={openFiles}
									pvcQuery={pvcQuery}
									pvcs={pvcs}
									storageClasses={storageClassesQuery.data ?? []}
								/>
							</TabsContent>
							<TabsContent className="m-0 flex h-full min-h-0 flex-col gap-4" value="files">
								<ViewerLaunchPanel
									api={api}
									autoStartKey={launchKey}
									onSessionStatusChange={setSessionStatus}
									pvc={selectedPVC}
									setToken={setToken}
								/>
								<FileManagerView
									currentPath={currentPath}
									onBackToVolumes={() => viewerUIStore.actions.setView('volumes')}
									onPathChange={(path) => {
										if (path !== trashRootPath) {
											setCurrentPath(path)
										}
									}}
									onRefreshSession={refreshActiveSession}
									pvcName={selectedPVC?.name}
									session={fileSession}
									sessionStatus={sessionStatus}
									setSort={setSort}
									sort={sort}
								/>
							</TabsContent>
							<TabsContent className="m-0 flex h-full min-h-0 flex-col" value="trash">
								<RecycleBinView session={fileSession} />
							</TabsContent>
						</Tabs>
					</div>
				</div>
			</div>

			<CreatePVCDialog
				defaultNamespace={namespace}
				mutation={createPVC}
				onOpenChange={setCreateOpen}
				open={createOpen}
				storageClasses={storageClassesQuery.data ?? []}
			/>
			<ExpandPVCDialog
				mutation={expandPVCMutation}
				onOpenChange={setExpandPVC}
				pvc={expandPVC}
			/>
			<DeletePVCDialog
				deleteState={deleteState}
				mutation={deletePVC}
				onOpenChange={setDeleteState}
				onSuccess={() => {
					if (deleteState?.pvc.uid === selectedPVC?.uid) {
						setSelectedPVC(null)
						setToken(null)
					}
				}}
			/>
		</main>
	)
}

interface SidebarButtonProps {
	icon: React.ReactNode
	label: string
	value: ViewerView
	view: ViewerView
}

function SidebarButton({ icon, label, value, view }: SidebarButtonProps) {
	return (
		<Button
			className="justify-start"
			onClick={() => viewerUIStore.actions.setView(value)}
			variant={view === value ? 'secondary' : 'ghost'}
		>
			<span className="[&_svg]:size-4">{icon}</span>
			{label}
		</Button>
	)
}

interface VolumesViewProps {
	createOpen: boolean
	onCreateOpenChange: (open: boolean) => void
	onDelete: (pvc: PVC) => void
	onExpand: (pvc: PVC) => void
	onOpenFiles: (pvc: PVC) => void
	pvcQuery: UseQueryResult<PVC[], Error>
	pvcs: PVC[]
	storageClasses: StorageClass[]
}

function VolumesView({
	onCreateOpenChange,
	onDelete,
	onExpand,
	onOpenFiles,
	pvcQuery,
	pvcs,
	storageClasses,
}: VolumesViewProps) {
	const { t } = useTranslation()
	const search = useViewerSearch().trim().toLowerCase()
	const filteredPVCs = search
		? pvcs.filter((pvc) => {
				const mountedPodNames = pvc.mounted_pods.map(pod => pod.name).join(' ')
				return `${pvc.namespace} ${pvc.name} ${mountedPodNames}`.toLowerCase().includes(search)
			})
		: pvcs
	const capacity = pvcs.reduce((total, pvc) => total + pvc.capacity_bytes, 0)
	const mounted = pvcs.filter(pvc => pvc.mounted).length
	const unused = pvcs.length - mounted

	return (
		<section className="flex flex-col gap-4">
			<header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				<div>
					<h2 className="text-xl font-semibold">{t('nav.volumes')}</h2>
					<p className="text-sm text-muted-foreground">{t('viewer.pvcListDescription')}</p>
				</div>
				<Button onClick={() => onCreateOpenChange(true)}>
					<Plus data-icon="inline-start" />
					{t('volumes.create')}
				</Button>
			</header>
			<Separator />

			<div className="grid gap-3 md:grid-cols-3">
				<MetricCard label={t('volumes.totalAllocated')} value={formatBytes(capacity)} />
				<MetricCard label={t('volumes.mountedCount')} value={String(mounted)} />
				<MetricCard label={t('volumes.unusedCount')} value={String(unused)} />
			</div>

			{pvcQuery.isLoading ? <PVCListSkeleton /> : null}
			{pvcQuery.error
				? (
						<ErrorCallout title={t('common.error')}>
							{translateViewerError(pvcQuery.error, t)}
						</ErrorCallout>
					)
				: null}
			{!pvcQuery.isLoading && !pvcQuery.error
				? (
						<div className="rounded-lg border bg-card">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>{t('viewer.pvc')}</TableHead>
										<TableHead>{t('status.label')}</TableHead>
										<TableHead>{t('viewer.capacity')}</TableHead>
										<TableHead>{t('viewer.accessModes')}</TableHead>
										<TableHead className="text-right">{t('files.columns.actions')}</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{filteredPVCs.map(pvc => (
										<PVCRow
											key={pvc.uid}
											onDelete={onDelete}
											onExpand={onExpand}
											onOpenFiles={onOpenFiles}
											pvc={pvc}
										/>
									))}
									{filteredPVCs.length === 0
										? (
												<TableRow>
													<TableCell className="py-12 text-center text-muted-foreground" colSpan={5}>
														{storageClasses.length === 0 ? t('common.empty') : t('volumes.empty')}
													</TableCell>
												</TableRow>
											)
										: null}
								</TableBody>
							</Table>
						</div>
					)
				: null}
		</section>
	)
}

function MetricCard({ label, value }: { label: string, value: string }) {
	return (
		<div className="rounded-lg border bg-card p-4">
			<div className="text-sm text-muted-foreground">{label}</div>
			<div className="mt-2 text-2xl font-semibold">{value}</div>
		</div>
	)
}

interface PVCRowProps {
	onDelete: (pvc: PVC) => void
	onExpand: (pvc: PVC) => void
	onOpenFiles: (pvc: PVC) => void
	pvc: PVC
}

function PVCRow({ onDelete, onExpand, onOpenFiles, pvc }: PVCRowProps) {
	const { t } = useTranslation()
	const mountedTarget = pvc.mounted_pods[0]
	const usagePercent = estimateUsagePercent(pvc)
	const canDelete = !pvc.mounted

	return (
		<TableRow>
			<TableCell>
				<div className="flex min-w-0 items-center gap-3">
					<div className="flex size-9 items-center justify-center rounded-md border bg-muted text-muted-foreground">
						<HardDrive />
					</div>
					<div className="min-w-0">
						<div className="truncate font-medium">{pvc.name}</div>
						<div className="truncate text-xs text-muted-foreground">
							{mountedTarget ? `${mountedTarget.name} · ${mountedTarget.namespace}` : pvc.namespace}
						</div>
					</div>
				</div>
			</TableCell>
			<TableCell>
				<div className="flex flex-col gap-1">
					<PVCStatusBadge pvc={pvc} />
					<span className="text-xs text-muted-foreground">
						{pvc.mounted ? t('status.mounted') : t('status.ready')}
					</span>
				</div>
			</TableCell>
			<TableCell>
				<div className="min-w-36">
					<div className="flex justify-between gap-2 text-sm">
						<span>{pvc.capacity || formatBytes(pvc.capacity_bytes)}</span>
						<span className="text-muted-foreground">
							{usagePercent}
							%
						</span>
					</div>
					<div className="mt-2 h-2 rounded-full bg-muted">
						<div className="h-2 rounded-full bg-primary" style={{ width: `${usagePercent}%` }} />
					</div>
				</div>
			</TableCell>
			<TableCell>
				<div className="flex flex-wrap gap-1">
					{pvc.access_modes.map(mode => (
						<Badge key={mode} variant="outline">{mode}</Badge>
					))}
				</div>
			</TableCell>
			<TableCell>
				<div className="flex justify-end gap-2">
					<Button
						disabled={!canLaunchViewer(pvc)}
						onClick={() => onOpenFiles(pvc)}
						size="sm"
					>
						<FolderOpen data-icon="inline-start" />
						{t('files.browse')}
					</Button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button aria-label={t('actions.more')} size="icon" variant="outline">
								<MoreHorizontal />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuGroup>
								<DropdownMenuItem onSelect={() => onExpand(pvc)}>
									{t('volumes.expand')}
								</DropdownMenuItem>
								<DropdownMenuItem
									disabled={!canDelete}
									onSelect={() => onDelete(pvc)}
									variant="destructive"
								>
									{t('actions.delete')}
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</TableCell>
		</TableRow>
	)
}

function estimateUsagePercent(pvc: PVC) {
	if (!pvc.capacity_bytes) {
		return 0
	}
	if (pvc.mounted) {
		return 74
	}
	return 18
}

interface CreatePVCDialogProps {
	defaultNamespace: string
	mutation: UseMutationResult<PVC, Error, CreatePVCVariables>
	onOpenChange: (open: boolean) => void
	open: boolean
	storageClasses: StorageClass[]
}

function CreatePVCDialog({
	defaultNamespace,
	mutation,
	onOpenChange,
	open,
	storageClasses,
}: CreatePVCDialogProps) {
	const { t } = useTranslation()
	const [form, setForm] = useState<CreatePVCForm>({
		name: '',
		namespace: defaultNamespace,
		capacityGi: 10,
		accessMode: 'ReadWriteOnce',
		storageClassName: '__default__',
	})

	function update(patch: Partial<CreatePVCForm>) {
		setForm(current => ({ ...current, ...patch }))
	}

	function submit() {
		mutation.mutate({
			namespace: form.namespace,
			name: form.name,
			capacity: `${form.capacityGi}Gi`,
			capacityBytes: form.capacityGi * 1024 * 1024 * 1024,
			accessModes: [form.accessMode],
			storageClassName: form.storageClassName === '__default__' ? undefined : form.storageClassName,
		}, {
			onSuccess: () => {
				toast.success(t('volumes.created'))
				setForm(current => ({ ...current, name: '' }))
				onOpenChange(false)
			},
			onError: error => toast.error(translateViewerError(error, t)),
		})
	}

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t('volumes.create')}</DialogTitle>
					<DialogDescription>{t('volumes.createDescription')}</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<FormField id="pvc-name" label={t('volumes.name')}>
						<Input id="pvc-name" onChange={event => update({ name: event.target.value })} value={form.name} />
					</FormField>
					<FormField id="pvc-namespace" label={t('common.namespace')}>
						<Input id="pvc-namespace" onChange={event => update({ namespace: event.target.value })} value={form.namespace} />
					</FormField>
					<FormField id="pvc-capacity" label={t('viewer.capacity')}>
						<Input
							id="pvc-capacity"
							min={1}
							onChange={event => update({ capacityGi: Number(event.target.value) })}
							type="number"
							value={form.capacityGi}
						/>
					</FormField>
					<FormField id="pvc-access-mode" label={t('viewer.accessModes')}>
						<Select onValueChange={value => update({ accessMode: value })} value={form.accessMode}>
							<SelectTrigger id="pvc-access-mode">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="ReadWriteOnce">ReadWriteOnce</SelectItem>
									<SelectItem value="ReadOnlyMany">ReadOnlyMany</SelectItem>
									<SelectItem value="ReadWriteMany">ReadWriteMany</SelectItem>
								</SelectGroup>
							</SelectContent>
						</Select>
					</FormField>
					<FormField id="pvc-storage-class" label={t('volumes.storageClass')}>
						<Select onValueChange={value => update({ storageClassName: value })} value={form.storageClassName}>
							<SelectTrigger id="pvc-storage-class">
								<SelectValue placeholder={t('volumes.defaultStorageClass')} />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="__default__">{t('volumes.defaultStorageClass')}</SelectItem>
									{storageClasses.map(storageClass => (
										<SelectItem key={storageClass.name} value={storageClass.name}>
											{storageClass.name}
											{storageClass.is_default ? ` · ${t('common.default')}` : ''}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</FormField>
				</div>
				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} variant="outline">
						{t('actions.cancel')}
					</Button>
					<Button
						disabled={mutation.isPending || !form.name || !form.namespace || form.capacityGi <= 0}
						onClick={submit}
					>
						{t('actions.create')}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

function FormField({
	children,
	id,
	label,
}: {
	children: React.ReactNode
	id: string
	label: string
}) {
	return (
		<div className="grid gap-2">
			<Label htmlFor={id}>{label}</Label>
			{children}
		</div>
	)
}

interface ExpandPVCDialogProps {
	mutation: UseMutationResult<PVC, Error, ExpandPVCVariables>
	onOpenChange: (pvc: PVC | null) => void
	pvc: PVC | null
}

function ExpandPVCDialog({ mutation, onOpenChange, pvc }: ExpandPVCDialogProps) {
	const { t } = useTranslation()
	const currentGi = pvc ? Math.max(1, Math.ceil(pvc.capacity_bytes / 1024 / 1024 / 1024)) : 1
	const [nextGi, setNextGi] = useState(currentGi + 10)
	const value = Math.max(nextGi, currentGi + 1)

	return (
		<Dialog
			onOpenChange={(open) => {
				if (!open) {
					onOpenChange(null)
				}
			}}
			open={pvc !== null}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t('volumes.expand')}</DialogTitle>
					<DialogDescription>{pvc ? `${pvc.namespace}/${pvc.name}` : ''}</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<div className="flex justify-between gap-4 text-sm">
						<span>{t('volumes.currentCapacity')}</span>
						<span>
							{currentGi}
							{' '}
							Gi
						</span>
					</div>
					<div className="flex justify-between gap-4 text-sm">
						<span>{t('volumes.targetCapacity')}</span>
						<span>
							{value}
							{' '}
							Gi
						</span>
					</div>
					<Slider
						max={Math.max(currentGi + 500, 512)}
						min={currentGi + 1}
						onValueChange={values => setNextGi(values[0] ?? currentGi + 1)}
						step={1}
						value={[value]}
					/>
					<p className="text-sm text-muted-foreground">{t('volumes.expandHint')}</p>
				</div>
				<DialogFooter>
					<Button onClick={() => onOpenChange(null)} variant="outline">
						{t('actions.cancel')}
					</Button>
					<Button
						disabled={!pvc || mutation.isPending}
						onClick={() => {
							if (!pvc) {
								return
							}
							mutation.mutate({
								namespace: pvc.namespace,
								name: pvc.name,
								capacity: `${value}Gi`,
								capacityBytes: value * 1024 * 1024 * 1024,
							}, {
								onSuccess: () => {
									toast.success(t('volumes.expanded'))
									onOpenChange(null)
								},
								onError: error => toast.error(translateViewerError(error, t)),
							})
						}}
					>
						{t('volumes.expand')}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

interface DeletePVCDialogProps {
	deleteState: DeletePVCState | null
	mutation: UseMutationResult<PVC, Error, DeletePVCVariables>
	onOpenChange: (state: DeletePVCState | null) => void
	onSuccess: () => void
}

function DeletePVCDialog({
	deleteState,
	mutation,
	onOpenChange,
	onSuccess,
}: DeletePVCDialogProps) {
	const { t } = useTranslation()
	const pvc = deleteState?.pvc

	return (
		<Dialog onOpenChange={open => !open && onOpenChange(null)} open={deleteState !== null}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t('volumes.deleteTitle')}</DialogTitle>
					<DialogDescription>{pvc ? t('volumes.deleteDescription', { name: pvc.name }) : ''}</DialogDescription>
				</DialogHeader>
				{pvc
					? (
							<div className="grid gap-2">
								<Label htmlFor="delete-confirm">{t('volumes.typeNameToConfirm')}</Label>
								<Input
									id="delete-confirm"
									onChange={event => onOpenChange({ pvc, confirmName: event.target.value })}
									value={deleteState.confirmName}
								/>
							</div>
						)
					: null}
				<DialogFooter>
					<Button onClick={() => onOpenChange(null)} variant="outline">
						{t('actions.cancel')}
					</Button>
					<Button
						disabled={!pvc || mutation.isPending || deleteState?.confirmName !== pvc.name}
						onClick={() => {
							if (!pvc) {
								return
							}
							mutation.mutate({
								namespace: pvc.namespace,
								name: pvc.name,
							}, {
								onSuccess: () => {
									toast.success(t('volumes.deleted'))
									onSuccess()
									onOpenChange(null)
								},
								onError: error => toast.error(translateViewerError(error, t)),
							})
						}}
						variant="destructive"
					>
						{t('actions.delete')}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
