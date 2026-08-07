import { CopilotChat } from '@/components/copilot/CopilotChat';

// Client streaming happens inside CopilotChat. The page itself is a Server
// Component so the shell + layout stay server-rendered.
export default function AssistantPage() {
  return <CopilotChat />;
}
