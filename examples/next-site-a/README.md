# Next.js integration example A

Target: main marketing site (`projectKey: etern8-main`)

Add [`ChatSupport.tsx`](/Users/yakovradchenko/Documents/Projects/chat-me/examples/next-site-a/ChatSupport.tsx) to your Next.js app and render it once in the root layout or a persistent client shell.

Recommended env on the site:

```bash
NEXT_PUBLIC_CHAT_ME_API=https://chat.black8.tech
```

Then mount:

```tsx
import { ChatSupport } from "./ChatSupport";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        {children}
        <ChatSupport />
      </body>
    </html>
  );
}
```
