"use client"

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
import useDeleteSkill from "@/src/hooks/skills/use-delete-skill"
import { IconLoader2, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

interface SkillDeleteDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	skillId: string | null
}

const SkillDeleteDialog = ({ open, onOpenChange, skillId }: SkillDeleteDialogProps) => {
	const deleteMutation = useDeleteSkill(skillId!)

	const handleDelete = async () => {
		if (!skillId) return

		try {
			await deleteMutation.mutateAsync()
			toast.success("Skill deleted")
			onOpenChange(false)
		} catch (error) {
			toast.error("Failed to delete skill", {
				description: (error as Error).message,
			})
		}
	}

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete Skill</AlertDialogTitle>
					<AlertDialogDescription>
						This will permanently delete this skill. This action cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={handleDelete}
						disabled={deleteMutation.isPending}
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					>
						{deleteMutation.isPending ? (
							<IconLoader2 className="size-4 animate-spin" />
						) : (
							<IconTrash className="size-4" />
						)}
						{deleteMutation.isPending ? "Deleting..." : "Delete Permanently"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

export default SkillDeleteDialog
