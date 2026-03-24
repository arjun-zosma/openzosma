"use client"

import { Button } from "@/src/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip"
import { DownloadIcon, EyeIcon, FileIcon, FileJsonIcon, FileTextIcon, ImageIcon } from "lucide-react"
import { useParams } from "next/navigation"
import type { FileArtifact } from "./types"

function formatSizeBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(mediatype: string) {
	if (mediatype.startsWith("image/")) return <ImageIcon className="size-4 text-blue-500" />
	if (mediatype === "application/json") return <FileJsonIcon className="size-4 text-yellow-500" />
	if (mediatype === "text/html") return <FileTextIcon className="size-4 text-orange-500" />
	if (mediatype.startsWith("text/")) return <FileTextIcon className="size-4 text-muted-foreground" />
	return <FileIcon className="size-4 text-muted-foreground" />
}

type ArtifactCardProps = {
	artifact: FileArtifact
	onPreview?: (artifact: FileArtifact) => void
}

const ArtifactCard = ({ artifact, onPreview }: ArtifactCardProps) => {
	const { conversationid } = useParams<{ conversationid: string }>()
	const downloadUrl = `/api/conversations/${conversationid}/artifacts/${encodeURIComponent(artifact.filename)}?download=true`
	const previewUrl = `/api/conversations/${conversationid}/artifacts/${encodeURIComponent(artifact.filename)}`

	const isPreviewable =
		artifact.mediatype.startsWith("image/") ||
		artifact.mediatype === "text/html" ||
		artifact.mediatype === "text/plain" ||
		artifact.mediatype === "text/markdown" ||
		artifact.mediatype === "text/csv" ||
		artifact.mediatype === "application/json"

	return (
		<div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-accent/50 w-fit max-w-sm">
			{getFileIcon(artifact.mediatype)}
			<div className="min-w-0 flex-1">
				<p className="truncate font-medium text-xs">{artifact.filename}</p>
				<p className="text-[10px] text-muted-foreground">{formatSizeBytes(artifact.sizebytes)}</p>
			</div>
			<div className="flex items-center gap-1 shrink-0">
				{isPreviewable && (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={() => {
										if (onPreview) {
											onPreview(artifact)
										} else {
											window.open(previewUrl, "_blank")
										}
									}}
								>
									<EyeIcon className="size-3.5" />
									<span className="sr-only">Preview</span>
								</Button>
							</TooltipTrigger>
							<TooltipContent>Preview</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				)}
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button variant="ghost" size="icon-sm" asChild>
								<a href={downloadUrl} download={artifact.filename}>
									<DownloadIcon className="size-3.5" />
									<span className="sr-only">Download</span>
								</a>
							</Button>
						</TooltipTrigger>
						<TooltipContent>Download</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</div>
		</div>
	)
}

type ArtifactCardListProps = {
	artifacts: FileArtifact[]
	onPreview?: (artifact: FileArtifact) => void
}

export const ArtifactCardList = ({ artifacts, onPreview }: ArtifactCardListProps) => {
	if (artifacts.length === 0) return null

	return (
		<div className="flex flex-wrap gap-2">
			{artifacts.map((artifact) => (
				<ArtifactCard key={artifact.filename} artifact={artifact} onPreview={onPreview} />
			))}
		</div>
	)
}

export default ArtifactCard
