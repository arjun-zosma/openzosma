"use client"

import SkillCard from "@/src/components/skills/skill-card"
import SkillCardSkeleton from "@/src/components/skills/skill-card-skeleton"
import SkillDeleteDialog from "@/src/components/skills/skill-delete-dialog"
import SkillDetailDialog from "@/src/components/skills/skill-detail-dialog"
import SkillFormDialog from "@/src/components/skills/skill-form-dialog"
import SkillsEmptyState from "@/src/components/skills/skills-empty-state"
import { Button } from "@/src/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs"
import { useGetSkills } from "@/src/hooks/skills/use-get-skills"
import type { Skill, SkillTab } from "@/src/types/skills"
import { IconPlus } from "@tabler/icons-react"
import { useState } from "react"

const TABS: SkillTab[] = ["all", "builtin", "custom"]

const TAB_LABELS: Record<SkillTab, string> = {
	all: "All",
	builtin: "Built-in",
	custom: "Custom",
}

const SkillsPage = () => {
	const { data: skills = [], isLoading } = useGetSkills()
	const [activeTab, setActiveTab] = useState<SkillTab>("all")

	const [formOpen, setFormOpen] = useState(false)
	const [editingSkill, setEditingSkill] = useState<Skill | null>(null)
	const [detailSkill, setDetailSkill] = useState<Skill | null>(null)
	const [deleteSkillId, setDeleteSkillId] = useState<string | null>(null)

	const filteredSkills = activeTab === "all" ? skills : skills.filter((s) => s.type === activeTab)

	const handleCreate = () => {
		setEditingSkill(null)
		setFormOpen(true)
	}

	const handleEdit = (skill: Skill) => {
		setEditingSkill(skill)
		setFormOpen(true)
	}

	return (
		<div className="flex flex-col w-full h-full gap-6">
			<div className="flex flex-row w-full justify-between items-center">
				<div>
					<h4 className="text-xl font-semibold">Skills</h4>
					<p className="text-sm text-muted-foreground">Browse, install, and create agent skills</p>
				</div>
				<Button onClick={handleCreate}>
					<IconPlus className="size-4" />
					Create Skill
				</Button>
			</div>

			<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SkillTab)}>
				<TabsList>
					{TABS.map((tab) => (
						<TabsTrigger key={tab} value={tab}>
							{TAB_LABELS[tab]}
						</TabsTrigger>
					))}
				</TabsList>

				{TABS.map((tab) => (
					<TabsContent key={tab} value={tab}>
						{isLoading ? (
							<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
								{Array.from({ length: 6 }).map((_, i) => (
									<SkillCardSkeleton key={i} />
								))}
							</div>
						) : filteredSkills.length === 0 ? (
							<SkillsEmptyState tab={tab} onCreateClick={handleCreate} />
						) : (
							<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
								{filteredSkills.map((skill) => (
									<SkillCard
										key={skill.id}
										skill={skill}
										onViewDetail={setDetailSkill}
										onEdit={handleEdit}
										onDelete={setDeleteSkillId}
									/>
								))}
							</div>
						)}
					</TabsContent>
				))}
			</Tabs>

			<SkillFormDialog open={formOpen} onOpenChange={setFormOpen} skill={editingSkill} />

			<SkillDetailDialog
				skill={detailSkill}
				onOpenChange={(open) => {
					if (!open) setDetailSkill(null)
				}}
			/>

			<SkillDeleteDialog
				open={!!deleteSkillId}
				onOpenChange={(open) => {
					if (!open) setDeleteSkillId(null)
				}}
				skillId={deleteSkillId}
			/>
		</div>
	)
}

export default SkillsPage
