"use client"

import { useCommandMenuStore } from "@/src/stores/command-menu-store"
import { motion } from "framer-motion"
import { SearchIcon } from "lucide-react"
import { useEffect, useState } from "react"

export const StickySearch = () => {
	const { setOpen } = useCommandMenuStore()
	const [ishovered, setIshovered] = useState(false)

	useEffect(() => {
		const handlekeydown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault()
				setOpen(true)
			}
		}
		window.addEventListener("keydown", handlekeydown)
		return () => window.removeEventListener("keydown", handlekeydown)
	}, [setOpen])

	return (
		<motion.button
			className="fixed bottom-4 right-4 z-50 flex items-center justify-end rounded-lg border bg-background/90 backdrop-blur-sm shadow-md cursor-pointer overflow-hidden h-9"
			animate={{ width: ishovered ? 200 : 64 }}
			transition={{ duration: 0.18, ease: "easeOut" }}
			onMouseEnter={() => setIshovered(true)}
			onMouseLeave={() => setIshovered(false)}
			onClick={() => setOpen(true)}
		>
			{/* Search icon + label — fades in from the left when expanded */}
			<motion.div
				className="flex items-center gap-2 pl-3 flex-1 min-w-0"
				animate={{ opacity: ishovered ? 1 : 0 }}
				transition={{ duration: 0.12 }}
			>
				<SearchIcon className="size-3.5 text-muted-foreground shrink-0" />
				<span className="text-sm text-muted-foreground whitespace-nowrap">Search...</span>
			</motion.div>

			{/* ⌘K badge — always on the right */}
			<div className="flex items-center gap-0.5 px-2 shrink-0">
				<kbd className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted-foreground leading-none">
					⌘
				</kbd>
				<kbd className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted-foreground leading-none">
					K
				</kbd>
			</div>
		</motion.button>
	)
}
