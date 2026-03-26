import { Button } from "@/src/components/ui/button"
// COMPONENTS
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu"
// HOOKS
import { useGetModels } from "@/src/hooks/models/use-get-models"
import { useCallback, useState } from "react"

type ModelSelectorProps = {
	setModel: (model: string) => void
}
const ModelSelector: React.FC<ModelSelectorProps> = ({ setModel }) => {
	const [selectedModel, setSelectedModel] = useState<{
		value: string
		label: string
	}>({ value: "auto", label: "Auto" })

	const { data } = useGetModels()

	const models = [
		{ value: "auto", label: "Auto" },
		{ value: "agent", label: "Agent" },
		{ value: "manual", label: "Manual" },
	]

	const handleChange = useCallback(
		(params: { value: string; label: string }) => () => {
			setSelectedModel(params)
			setModel(params.value)
		},
		[setModel],
	)

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size={"sm"} className="hover:bg-transparent cursor-pointer">
					{selectedModel.label}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent side="bottom" align="start" className="[--radius:0.95rem]">
				{models.map((model) => (
					<DropdownMenuItem key={model.value} onClick={handleChange(model)}>
						{model.label}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

export default ModelSelector
