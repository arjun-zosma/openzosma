"use client"

import { FileSidebar } from "@/src/components/organisms/knowledge-base/file-sidebar"
import RichTextEditorDemo from "@/src/components/tiptap/rich-text-editor"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/src/components/ui/resizable"
import useCreateKbFile from "@/src/hooks/knowledge-base/use-create-kb-file"
import useCreateKbFolder from "@/src/hooks/knowledge-base/use-create-kb-folder"
import useDeleteKbEntry from "@/src/hooks/knowledge-base/use-delete-kb-entry"
import useGetKbFile from "@/src/hooks/knowledge-base/use-get-kb-file"
import useGetKbTree from "@/src/hooks/knowledge-base/use-get-kb-tree"
import useRenameKbEntry from "@/src/hooks/knowledge-base/use-rename-kb-entry"
import useUpdateKbFile from "@/src/hooks/knowledge-base/use-update-kb-file"
import type { KBFile } from "@/src/services/knowledge-base.services"
import { QUERY_KEYS } from "@/src/utils/query-keys"
import { useQueryClient } from "@tanstack/react-query"
import {} from "@tiptap/markdown"
import { BookOpen } from "lucide-react"
import { useCallback, useState } from "react"
import { useDebouncedCallback } from "use-debounce"

const findFileById = (items: KBFile[], id: string): KBFile | undefined => {
	for (const item of items) {
		if (item.id === id) return item
		if (item.children) {
			const found = findFileById(item.children, id)
			if (found) return found
		}
	}
	return undefined
}

const buildParentMap = (items: KBFile[], parentId: string | null = null): Map<string, string | null> => {
	const map = new Map<string, string | null>()
	for (const item of items) {
		map.set(item.id, parentId)
		if (item.children) {
			for (const [k, v] of buildParentMap(item.children, item.id)) {
				map.set(k, v)
			}
		}
	}
	return map
}

const getChildPath = (parentId: string | null | undefined, name: string) => {
	return parentId ? `${parentId}/${name}` : name
}

const renameKeysInRecord = (
	record: Record<string, string>,
	oldPrefix: string,
	newPrefix: string,
): Record<string, string> => {
	const updated: Record<string, string> = {}
	for (const [k, v] of Object.entries(record)) {
		const newKey =
			k === oldPrefix ? newPrefix : k.startsWith(`${oldPrefix}/`) ? newPrefix + k.slice(oldPrefix.length) : k
		updated[newKey] = v
	}
	return updated
}

const KnowledgeBasePanel = () => {
	const queryClient = useQueryClient()
	const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
	const [contentCache, setContentCache] = useState<Record<string, string>>({})

	const { data: files = [], isLoading } = useGetKbTree()
	const { data: fetchedContent } = useGetKbFile(selectedFileId)
	const createFile = useCreateKbFile()
	const createFolder = useCreateKbFolder()
	const deleteEntry = useDeleteKbEntry()
	const renameEntry = useRenameKbEntry()
	const updateFile = useUpdateKbFile()

	const debouncedSave = useDebouncedCallback((id: string, markdown: string) => {
		updateFile.mutate({ path: id, content: markdown })
	}, 800)

	const selectedFile = selectedFileId ? findFileById(files, selectedFileId) : null
	const selectedContent = selectedFileId ? (contentCache[selectedFileId] ?? fetchedContent ?? null) : null

	const handleSelectFile = useCallback((id: string) => {
		setSelectedFileId(id)
	}, [])

	const handleContentChange = useCallback(
		(id: string, markdown: string) => {
			setContentCache((prev) => ({ ...prev, [id]: markdown }))
			debouncedSave(id, markdown)
		},
		[debouncedSave],
	)

	const handleCreateFile = useCallback(
		async (name: string, parentId?: string | null) => {
			const fileName = name.endsWith(".md") ? name : `${name}.md`
			const filePath = getChildPath(parentId, fileName)
			const initialContent = `# ${name.replace(/\.md$/, "")}\n\nStart writing here...`

			await createFile.mutateAsync({ path: filePath, content: initialContent })
			setContentCache((prev) => ({ ...prev, [filePath]: initialContent }))
			setSelectedFileId(filePath)
		},
		[createFile],
	)

	const handleCreateFolder = useCallback(
		async (name: string, parentId?: string | null) => {
			await createFolder.mutateAsync({ path: getChildPath(parentId, name) })
		},
		[createFolder],
	)

	const handleRenameFile = useCallback(
		async (id: string, newName: string) => {
			const file = findFileById(files, id)
			if (!file) return

			const parentMap = buildParentMap(files)
			const parentId = parentMap.get(id) ?? null
			const newPath = getChildPath(parentId, newName)

			await renameEntry.mutateAsync({ oldPath: id, newPath })

			setContentCache((prev) => renameKeysInRecord(prev, id, newPath))
			queryClient.setQueryData([QUERY_KEYS.KB_FILE, newPath], contentCache[id])

			setSelectedFileId((prev) => {
				if (prev === id) return newPath
				if (prev?.startsWith(`${id}/`)) return newPath + prev.slice(id.length)
				return prev
			})
		},
		[files, renameEntry, queryClient, contentCache],
	)

	const handleDeleteFile = useCallback(
		async (id: string) => {
			const file = findFileById(files, id)
			if (!file) return

			await deleteEntry.mutateAsync({ path: id, type: file.type })

			setSelectedFileId((prev) => {
				if (prev === id || prev?.startsWith(`${id}/`)) return null
				return prev
			})
		},
		[files, deleteEntry],
	)

	const handleMoveFile = useCallback(
		async (itemId: string, newParentId: string | null) => {
			const file = findFileById(files, itemId)
			if (!file) return

			const newPath = newParentId ? `${newParentId}/${file.name}` : file.name
			if (newPath === itemId) return

			await renameEntry.mutateAsync({ oldPath: itemId, newPath })

			setContentCache((prev) => renameKeysInRecord(prev, itemId, newPath))

			setSelectedFileId((prev) => {
				if (prev === itemId) return newPath
				if (prev?.startsWith(`${itemId}/`)) return newPath + prev.slice(itemId.length)
				return prev
			})
		},
		[files, renameEntry],
	)

	return (
		<div className="h-full overflow-hidden rounded-lg border border-border bg-background">
			<ResizablePanelGroup direction="horizontal">
				<ResizablePanel defaultSize={25} minSize={18} maxSize={40} className="bg-muted/20">
					<FileSidebar
						files={files}
						selectedFileId={selectedFileId}
						loading={isLoading}
						onSelectFile={handleSelectFile}
						onCreateFile={handleCreateFile}
						onCreateFolder={handleCreateFolder}
						onRenameFile={handleRenameFile}
						onDeleteFile={handleDeleteFile}
						onMoveFile={handleMoveFile}
					/>
				</ResizablePanel>

				<ResizableHandle withHandle />

				<ResizablePanel defaultSize={75}>
					{selectedFile && selectedFile.type === "file" && selectedContent !== null ? (
						<RichTextEditorDemo
							key={selectedFile.id}
							initialContent={selectedContent}
							onChange={(md) => handleContentChange(selectedFile.id, md)}
						/>
					) : (
						<div className="flex h-full flex-col items-center justify-center text-muted-foreground">
							<div className="rounded-xl bg-muted p-4 mb-4">
								<BookOpen className="size-8" />
							</div>
							<p className="text-sm font-medium text-foreground">No file selected</p>
							<p className="text-xs text-muted-foreground mt-1">Select a file from the sidebar to start editing</p>
						</div>
					)}
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	)
}

export default KnowledgeBasePanel
