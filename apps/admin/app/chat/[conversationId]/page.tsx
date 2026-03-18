import { ChatConsole } from "../../../components/chat-console";

export default async function ConversationPage({
  params
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const resolved = await params;
  return <ChatConsole conversationId={Number.parseInt(resolved.conversationId, 10)} />;
}
