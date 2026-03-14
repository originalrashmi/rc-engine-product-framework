# Stack: TypeScript + Next.js

## Project Structure
```
src/
  app/              # App Router pages and layouts
    (auth)/          # Route groups for auth pages
    api/             # API routes (Route Handlers)
    layout.tsx       # Root layout
    page.tsx         # Home page
  components/        # Shared UI components
    ui/              # Primitive UI components
  lib/               # Utility functions, db client, auth config
  types/             # Shared TypeScript types
  hooks/             # Custom React hooks
prisma/
  schema.prisma      # Database schema
  migrations/        # Migration files
public/              # Static assets
```

## Conventions
- Use App Router (not Pages Router)
- Server Components by default; add `'use client'` only when needed (hooks, event handlers, browser APIs)
- Route Handlers in `app/api/` for backend endpoints
- Use `next/navigation` (not `next/router`)
- Prefer Server Actions for mutations when possible
- Use `loading.tsx` and `error.tsx` for loading/error states

## Database (Prisma + PostgreSQL)
- Define models in `prisma/schema.prisma`
- Use `@prisma/client` singleton pattern in `lib/db.ts`
- Always use parameterized queries (Prisma handles this)
- Run `npx prisma generate` after schema changes
- Use `npx prisma db push` for development, migrations for production

## Authentication
- Use NextAuth.js v5 (Auth.js) with `auth.ts` config
- Session strategy: JWT for serverless, database for traditional
- Middleware in `middleware.ts` for route protection

## Styling
- Tailwind CSS with `tailwind.config.ts`
- Use CSS variables for design tokens: `--color-primary`, `--spacing-md`
- shadcn/ui components installed to `components/ui/`
- Responsive: mobile-first with `sm:`, `md:`, `lg:` breakpoints

## API Patterns
```typescript
// app/api/items/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const items = await db.item.findMany();
  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  // Validate with Zod
  const item = await db.item.create({ data: body });
  return NextResponse.json(item, { status: 201 });
}
```

## Validation
- Use Zod for runtime validation on API inputs
- Share Zod schemas between client and server
- Never trust client input - validate on the server

## Testing
- Vitest for unit tests, Playwright for E2E
- Test files: `*.test.ts` or `*.test.tsx` co-located with source
- Mock Prisma client in tests with `vitest-mock-extended`

## Environment Variables
- `.env.local` for development (not committed)
- `NEXT_PUBLIC_` prefix for client-side variables
- Validate env vars at build time with `@t3-oss/env-nextjs`
