import { Clock, FileText, Wrench, type LucideIcon } from 'lucide-react'

const TOOL_ICON: Record<string, LucideIcon> = { read_file: FileText, get_time: Clock }

/** One icon per tool, used wherever a tool call shows up (thread and Activity). */
export const toolIcon = (name?: string): LucideIcon => (name && TOOL_ICON[name]) || Wrench
