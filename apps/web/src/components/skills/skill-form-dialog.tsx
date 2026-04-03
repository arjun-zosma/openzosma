"use client"

import { Button } from "@/src/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/src/components/ui/dialog"
import { Input } from "@/src/components/ui/input"
import { Label } from "@/src/components/ui/label"
import { Textarea } from "@/src/components/ui/textarea"
import useCreateSkill from "@/src/hooks/skills/use-create-skill"
import useUpdateSkill from "@/src/hooks/skills/use-update-skill"
import type { Skill } from "@/src/types/skills"
import { IconCode, IconLoader2 } from "@tabler/icons-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

interface SkillFormDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	skill: Skill | null
}

const SkillFormDialog = ({ open, onOpenChange, skill }: SkillFormDialogProps) => {
	const [name, setName] = useState("")
	const [description, setDescription] = useState("")
	const [content, setContent] = useState("")
	const { id } = skill ?? {}

	const createMutation = useCreateSkill()
	const updateMutation = useUpdateSkill(id!)

	const isEditing = !!skill
	const saving = createMutation.isPending || updateMutation.isPending

	useEffect(() => {
		if (open) {
			setName(skill?.name ?? "")
			setDescription(skill?.description ?? "")
			setContent(skill?.content ?? "")
		}
	}, [open, skill])

	const handleSave = async () => {
		if (!name.trim()) {
			toast.error("Name is required")
			return
		}

		try {
			if (isEditing) {
				await updateMutation.mutateAsync({
					name: name.trim(),
					description: description.trim(),
					content,
				})
				toast.success("Skill updated")
			} else {
				await createMutation.mutateAsync({
					name: name.trim(),
					description: description.trim(),
					source: "file" as const,
					content,
				})
				toast.success("Skill created")
			}
			onOpenChange(false)
		} catch (error) {
			toast.error(`Failed to ${isEditing ? "update" : "create"} skill`, {
				description: (error as Error).message,
			})
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{isEditing ? "Edit Skill" : "Create Skill"}</DialogTitle>
					<DialogDescription>
						{isEditing
							? "Update the skill definition below."
							: "Define a new custom skill. The content field accepts SKILL.md markdown."}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4 py-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="skill-name">Name</Label>
						<Input
							id="skill-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="My Custom Skill"
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="skill-description">Description</Label>
						<Textarea
							id="skill-description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="What this skill does..."
							rows={2}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="skill-content">Content (SKILL.md)</Label>
						<Textarea
							id="skill-content"
							value={content}
							onChange={(e) => setContent(e.target.value)}
							placeholder={"# My Skill\n\nInstructions for the agent..."}
							className="font-mono text-sm min-h-[200px] max-h-96 overflow-y-scroll"
							rows={10}
						/>
					</div>
				</div>

				<div className="flex justify-end gap-2 pt-2">
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={!name.trim() || saving}>
						{saving ? <IconLoader2 className="size-4 animate-spin" /> : <IconCode className="size-4" />}
						{saving ? "Saving..." : isEditing ? "Update Skill" : "Create Skill"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}

export default SkillFormDialog
