"use client"

import { Button } from "@/src/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/src/components/ui/dialog"
import { ScrollArea } from "@/src/components/ui/scroll-area"
import { DownloadIcon, ExternalLinkIcon } from "lucide-react"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import type { FileArtifact } from "./types"

type ArtifactPreviewProps = {
	artifact: FileArtifact | null
	onClose: () => void
}

const ArtifactPreview = ({ artifact, onClose }: ArtifactPreviewProps) => {
	const { conversationid } = useParams<{ conversationid: string }>()
	const [textContent, setTextContent] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)

	const previewUrl = artifact
		? `/api/conversations/${conversationid}/artifacts/${encodeURIComponent(artifact.filename)}`
		: null
	const downloadUrl = previewUrl ? `${previewUrl}?download=true` : null

	const isImage = artifact?.mediatype.startsWith("image/") ?? false
	const isHtml = artifact?.mediatype === "text/html"
	const isText =
		artifact?.mediatype === "text/plain" ||
		artifact?.mediatype === "text/markdown" ||
		artifact?.mediatype === "text/csv" ||
		artifact?.mediatype === "application/json"

	// Fetch text content for text-based previews
	useEffect(() => {
		if (!artifact || !previewUrl || !isText) {
			setTextContent(null)
			return
		}

		setLoading(true)
		fetch(previewUrl)
			.then((res) => res.text())
			.then((text) => {
				setTextContent(text)
				setLoading(false)
			})
			.catch(() => {
				setTextContent("Failed to load file content")
				setLoading(false)
			})
	}, [artifact, previewUrl, isText])

	return (
		<Dialog open={artifact !== null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col">
				<DialogHeader className="shrink-0">
					<div className="flex items-center justify-between pr-8">
						<DialogTitle className="truncate text-sm">{artifact?.filename}</DialogTitle>
						<div className="flex items-center gap-1">
							{previewUrl && (
								<Button variant="ghost" size="icon-sm" asChild>
									<a href={previewUrl} target="_blank" rel="noopener noreferrer">
										<ExternalLinkIcon className="size-3.5" />
										<span className="sr-only">Open in new tab</span>
									</a>
								</Button>
							)}
							{downloadUrl && (
								<Button variant="ghost" size="icon-sm" asChild>
									<a href={downloadUrl} download={artifact?.filename}>
										<DownloadIcon className="size-3.5" />
										<span className="sr-only">Download</span>
									</a>
								</Button>
							)}
						</div>
					</div>
				</DialogHeader>

				<div className="flex-1 min-h-0 overflow-hidden rounded-md border bg-muted/30">
					{isHtml && previewUrl && (
						<iframe
							src={previewUrl}
							title={artifact?.filename ?? "Preview"}
							className="w-full h-full min-h-[60vh]"
							sandbox="allow-scripts allow-same-origin"
						/>
					)}

					{isImage && previewUrl && (
						<div className="flex items-center justify-center p-4 h-full">
							<img
								src={previewUrl}
								alt={artifact?.filename ?? "Preview"}
								className="max-w-full max-h-[60vh] object-contain rounded"
							/>
						</div>
					)}

					{isText && (
						<ScrollArea className="h-full max-h-[60vh]">
							<pre className="p-4 text-xs font-mono whitespace-pre-wrap break-words">
								{loading ? "Loading..." : textContent}
							</pre>
						</ScrollArea>
					)}

					{!isHtml && !isImage && !isText && (
						<div className="flex flex-col items-center justify-center py-16 px-4 text-center">
							<p className="text-sm text-muted-foreground mb-4">Preview not available for this file type</p>
							{downloadUrl && (
								<Button variant="outline" size="sm" asChild>
									<a href={downloadUrl} download={artifact?.filename}>
										<DownloadIcon className="size-3.5 mr-2" />
										Download file
									</a>
								</Button>
							)}
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	)
}

export default ArtifactPreview
