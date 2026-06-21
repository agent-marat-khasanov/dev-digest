# RSC Boundaries (as a placement decision)

This is about **where** `"use client"` goes — an architecture/placement concern. (Bundle-size and hydration *performance* arguments live in `next-best-practices`; here we care about *structure*.)

## Default: Server Component

Components in `app/` are **Server Components by default**. Don't add `"use client"` reflexively — add it only when a component genuinely needs the client.

A component must be a Client Component when it uses:
- React state/effect hooks (`useState`, `useEffect`, `useContext`),
- event handlers (`onClick`, `onChange`, …),
- browser-only APIs (`window`, `localStorage`),
- client navigation (`useRouter`),
- **TanStack Query hooks** (so every `lib/hooks/*` file is `"use client"`).

## `"use client"` is a contagious boundary — place it low

Once a file has `"use client"`, everything it imports and renders joins the client module graph. So the directive is a **boundary**, and its placement is the decision:

- ✅ Push the boundary to the **leaves** — the smallest node that actually needs interactivity.
- ❌ Don't slap `"use client"` on a page/layout to enable one button; that drags the whole subtree client-side.

Mental model: keep the top of the tree on the server (data fetching, static layout); isolate interactive bits as small client leaves.

```
PrDetailPage         (Server — fetches/passes data)
 ├─ PrDetailHeader   (Server — static)
 ├─ FindingsPanel    (Server — renders findings)
 │   └─ FilterBar    (Client — the only interactive leaf)
 └─ VerdictBanner    (Server)
```

## Children-pattern for providers/wrappers

A client wrapper (context provider, interactive shell) can still render **server** children — pass them as `children`/props instead of importing them. Imported children join the client bundle; children passed as props are server-rendered and slotted in.

```tsx
// providers.tsx  — "use client"
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider>{children}</ThemeProvider>   {/* children stay server-rendered */}
    </QueryClientProvider>
  );
}

// layout.tsx (Server)
<Providers><ServerContent /></Providers>          // ✅ ServerContent not imported into the client file
```

Rule: **never import a Server Component into a Client Component.** Pass it as `children` or a prop.

## Props crossing the boundary must be serializable

Props handed to a Client Component are serialized to JSON. No functions, class instances, Dates-as-objects, or circular refs across the boundary. Keep the contract simple — primitives, plain objects, arrays.

## Where this shows up in DevDigest

- Pages that use Query hooks or interactivity carry `"use client"` (e.g. the PR list page).
- All `lib/hooks/*`, `lib/providers.tsx`, `lib/repo-context.tsx`, `lib/theme.tsx`, `lib/toast.tsx` are client.
- Static layout/chrome stays server where it can.

Sources: [Next.js server/client docs](https://nextjs.org/docs/app/getting-started/server-and-client-components), [iamraghuveer — drawing the boundary](https://www.iamraghuveer.com/posts/nextjs-server-vs-client-components/). See [references.md](references.md).
