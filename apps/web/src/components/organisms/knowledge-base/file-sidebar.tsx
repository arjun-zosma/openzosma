"use client"

import { File, Folder, Tree, type TreeViewElement } from "@/src/components/molecules/file-tree"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/src/components/ui/alert-dialog"
import { Button } from "@/src/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu"
import { Input } from "@/src/components/ui/input"
import type { KBFile } from "@/src/services/knowledge-base.services"
import { FilePlus, FileText, FolderPlus, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"

export type { KBFile }

interface FileSidebarProps {
	files: KBFile[]
	selectedFileId: string | null
	loading?: boolean
	onSelectFile: (id: string) => void
	onCreateFile: (name: string, parentId?: string | null) => void
	onCreateFolder: (name: string, parentId?: string | null) => void
	onRenameFile: (id: string, newName: string) => void
	onDeleteFile: (id: string) => void
}

function InlineInput({
	defaultValue,
	onSubmit,
	onCancel,
	placeholder,
}: {
	defaultValue?: string
	onSubmit: (value: string) => void
	onCancel: () => void
	placeholder?: string
}) {
	const [value, setValue] = useState(defaultValue || "")
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		inputRef.current?.focus()
		inputRef.current?.select()
	}, [])

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault()
				const trimmed = value.trim()
				if (trimmed) onSubmit(trimmed)
				else onCancel()
			}}
			className="px-2 py-1"
		>
			<Input
				ref={inputRef}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onBlur={() => {
					const trimmed = value.trim()
					if (trimmed) onSubmit(trimmed)
					else onCancel()
				}}
				onKeyDown={(e) => {
					if (e.key === "Escape") onCancel()
				}}
				placeholder={placeholder}
				className="h-7 text-xs font-mono"
			/>
		</form>
	)
}

export function FileSidebar({
	files,
	selectedFileId,
	loading = false,
	onSelectFile,
	onCreateFile,
	onCreateFolder,
	onRenameFile,
	onDeleteFile,
}: FileSidebarProps) {
	const [creating, setCreating] = useState<{ type: "file" | "folder"; parentId?: string | null } | null>(null)
	const [renaming, setRenaming] = useState<string | null>(null)
	const [deleteTarget, setDeleteTarget] = useState<KBFile | null>(null)

	const toTreeElements = (items: KBFile[]): TreeViewElement[] =>
		items.map((item) => ({
			id: item.id,
			name: item.name,
			type: item.type,
			children: item.children ? toTreeElements(item.children) : undefined,
		}))

	const treeElements = toTreeElements(files)

	const allFolderIds = (items: KBFile[]): string[] =>
		items.flatMap((item) =>
			item.type === "folder" ? [item.id, ...(item.children ? allFolderIds(item.children) : [])] : [],
		)

	const findFile = (items: KBFile[], id: string): KBFile | undefined => {
		for (const item of items) {
			if (item.id === id) return item
			if (item.children) {
				const found = findFile(item.children, id)
				if (found) return found
			}
		}
		return undefined
	}

	const renderContextMenu = (file: KBFile) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
					onClick={(e) => e.stopPropagation()}
				>
					<MoreHorizontal className="size-3" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-40">
				{file.type === "folder" && (
					<>
						<DropdownMenuItem
							onClick={(e) => {
								e.stopPropagation()
								setCreating({ type: "file", parentId: file.id })
							}}
						>
							<FilePlus className="mr-2 size-3.5" />
							New File
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={(e) => {
								e.stopPropagation()
								setCreating({ type: "folder", parentId: file.id })
							}}
						>
							<FolderPlus className="mr-2 size-3.5" />
							New Folder
						</DropdownMenuItem>
					</>
				)}
				<DropdownMenuItem
					onClick={(e) => {
						e.stopPropagation()
						setRenaming(file.id)
					}}
				>
					<Pencil className="mr-2 size-3.5" />
					Rename
				</DropdownMenuItem>
				<DropdownMenuItem
					className="text-destructive focus:text-destructive"
					onClick={(e) => {
						e.stopPropagation()
						setDeleteTarget(file)
					}}
				>
					<Trash2 className="mr-2 size-3.5" />
					Delete
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)

	const renderFileItems = (items: KBFile[]): React.ReactNode =>
		items.map((item) => {
			if (renaming === item.id) {
				return (
					<InlineInput
						key={item.id}
						defaultValue={item.name}
						placeholder="Enter name..."
						onSubmit={(newName) => {
							onRenameFile(item.id, item.type === "file" && !newName.endsWith(".md") ? `${newName}.md` : newName)
							setRenaming(null)
						}}
						onCancel={() => setRenaming(null)}
					/>
				)
			}

			if (item.type === "folder") {
				return (
					<Folder key={item.id} value={item.id} element={item.name}>
						{item.children && renderFileItems(item.children)}
						{creating && creating.parentId === item.id && (
							<InlineInput
								placeholder={creating.type === "file" ? "Filename.md" : "Folder name"}
								onSubmit={(name) => {
									if (creating.type === "file") {
										onCreateFile(name.endsWith(".md") ? name : `${name}.md`, item.id)
									} else {
										onCreateFolder(name, item.id)
									}
									setCreating(null)
								}}
								onCancel={() => setCreating(null)}
							/>
						)}
					</Folder>
				)
			}

			return (
				<div key={item.id} className="group flex items-center">
					<File
						value={item.id}
						handleSelect={() => onSelectFile(item.id)}
						className="flex-1"
						fileIcon={<FileText className="size-4 text-muted-foreground" />}
					>
						<p className="truncate text-base">{item.name}</p>
					</File>
					{renderContextMenu(item)}
				</div>
			)
		})

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between border-b border-border px-3 py-2">
				<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Files</span>
				<div className="flex items-center gap-0.5">
					<Button
						variant="ghost"
						size="icon"
						className="size-6 text-muted-foreground hover:text-foreground"
						onClick={() => setCreating({ type: "file", parentId: null })}
					>
						<FilePlus className="size-3.5" />
						<span className="sr-only">New file</span>
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-6 text-muted-foreground hover:text-foreground"
						onClick={() => setCreating({ type: "folder", parentId: null })}
					>
						<FolderPlus className="size-3.5" />
						<span className="sr-only">New folder</span>
					</Button>
				</div>
			</div>

			<div className="flex-1 overflow-auto py-2">
				{loading ? (
					<div className="flex items-center justify-center py-8 text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
					</div>
				) : files.length === 0 && !creating ? (
					<div className="flex flex-col items-center justify-center px-4 py-8 text-center">
						<div className="rounded-lg bg-muted p-3 mb-3">
							<FileText className="size-5 text-muted-foreground" />
						</div>
						<p className="text-sm font-medium text-foreground">No files yet</p>
						<p className="text-xs text-muted-foreground mt-1">Create your first markdown file</p>
						<Button
							variant="outline"
							size="sm"
							className="mt-3"
							onClick={() => setCreating({ type: "file", parentId: null })}
						>
							<Plus className="mr-1.5 size-3.5" />
							New File
						</Button>
					</div>
				) : (
					<Tree
						elements={treeElements}
						initialSelectedId={selectedFileId ?? undefined}
						initialExpandedItems={allFolderIds(files)}
						indicator
					>
						{renderFileItems(files)}
						{creating && !creating.parentId && (
							<InlineInput
								placeholder={creating.type === "file" ? "Filename.md" : "Folder name"}
								onSubmit={(name) => {
									if (creating.type === "file") {
										onCreateFile(name.endsWith(".md") ? name : `${name}.md`, null)
									} else {
										onCreateFolder(name, null)
									}
									setCreating(null)
								}}
								onCancel={() => setCreating(null)}
							/>
						)}
					</Tree>
				)}
			</div>

			<AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete {deleteTarget?.type === "folder" ? "folder" : "file"}</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;?
							{deleteTarget?.type === "folder" && " This will delete all files inside it."} This action cannot be
							undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() => {
								if (deleteTarget) onDeleteFile(deleteTarget.id)
								setDeleteTarget(null)
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}
