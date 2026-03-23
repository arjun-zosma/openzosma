"use client"
import "./tiptap.css"
import { TipTapFloatingMenu } from "@/src/components/tiptap/extensions/floating-menu"
import SearchAndReplace from "@/src/components/tiptap/extensions/search-and-replace"
import { cn } from "@/src/lib/utils"
import { Color } from "@tiptap/extension-color"
import Highlight from "@tiptap/extension-highlight"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import Subscript from "@tiptap/extension-subscript"
import Superscript from "@tiptap/extension-superscript"
import TextAlign from "@tiptap/extension-text-align"
import { TextStyle } from "@tiptap/extension-text-style"
import Typography from "@tiptap/extension-typography"
import Underline from "@tiptap/extension-underline"
import { Markdown } from "@tiptap/markdown"
import { EditorContent, type Extension, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"

const extensions = [
	Markdown,
	StarterKit.configure({
		orderedList: {
			HTMLAttributes: {
				class: "list-decimal",
			},
		},
		bulletList: {
			HTMLAttributes: {
				class: "list-disc",
			},
		},
		heading: {
			levels: [1, 2, 3, 4],
		},
	}),
	Placeholder.configure({
		emptyNodeClass: "is-editor-empty",
		placeholder: ({ node }) => {
			switch (node.type.name) {
				case "heading":
					return `Heading ${node.attrs.level}`
				case "detailsSummary":
					return "Section title"
				case "codeBlock":
					return ""
				default:
					return "Write, type '/' for commands"
			}
		},
		includeChildren: false,
	}),
	TextAlign.configure({
		types: ["heading", "paragraph"],
	}),
	TextStyle,
	Subscript,
	Superscript,
	Underline,
	Link,
	Color,
	Highlight.configure({
		multicolor: true,
	}),
	SearchAndReplace,
	Typography,
]

interface RichTextEditorProps {
	className?: string
	initialContent?: string
	onChange?: (markdown: string) => void
}

const RichTextEditorDemo = ({ className, initialContent, onChange }: RichTextEditorProps) => {
	const editor = useEditor({
		immediatelyRender: false,
		extensions: extensions as Extension[],
		content: initialContent ?? "",
		contentType: "markdown",
		editorProps: {
			attributes: {
				class: "max-w-full focus:outline-none",
			},
		},
		onUpdate: ({ editor }) => {
			onChange?.(editor.getMarkdown())
		},
	})

	if (!editor) return null

	return (
		<div className={cn("relative h-full w-full overflow-hidden border bg-card pb-[60px] sm:pb-0", className)}>
			<TipTapFloatingMenu editor={editor} />
			<EditorContent editor={editor} className="h-full w-full min-w-full cursor-text sm:p-6" />
		</div>
	)
}

export default RichTextEditorDemo
