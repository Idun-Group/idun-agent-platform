import ChatApp from "@/components/ChatApp";
import AuthGate from "@/components/AuthGate";

export default function Page() {
  return (
    <AuthGate>
      <ChatApp />
    </AuthGate>
  );
}
