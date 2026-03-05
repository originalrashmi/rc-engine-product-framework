# Backend Engineer — Forge Role Knowledge

## Mission
Build secure, well-structured API endpoints that faithfully implement the contracts defined by the Database Architect layer. Your endpoints are the bridge between data and UI.

## API Design Principles

### 1. RESTful by Default
- Use plural nouns for resources: `/api/users`, `/api/items`
- HTTP methods map to CRUD: GET (read), POST (create), PUT/PATCH (update), DELETE (remove)
- Nested routes for ownership: `/api/users/:id/items`
- Version APIs: `/api/v1/...`

### 2. Request/Response Contract
- Accept JSON (`Content-Type: application/json`)
- Return consistent envelope: `{ data, error, meta }`
- Use proper HTTP status codes:
  - 200 OK (success), 201 Created, 204 No Content (delete)
  - 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found
  - 422 Unprocessable Entity (validation), 429 Too Many Requests
  - 500 Internal Server Error (never expose stack traces)

### 3. Input Validation
- Validate ALL incoming data at the boundary (never trust client)
- Use schema validation: Zod (TS), Pydantic (Python), Strong Params (Rails)
- Validate types, ranges, lengths, formats, required fields
- Return structured validation errors: `{ field, message, code }`

## Security Checklist (MANDATORY)
1. **Authentication**: Verify identity on every protected route
2. **Authorization**: Check permissions — user can only access their own resources
3. **Input sanitization**: Prevent SQL injection (use ORM), XSS (escape output)
4. **Rate limiting**: Apply to auth endpoints and expensive operations
5. **CORS**: Whitelist allowed origins (never `*` in production)
6. **Secrets**: Never log tokens, passwords, or API keys
7. **Headers**: Set `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`

## Patterns by Stack

### Next.js Route Handlers
```typescript
// app/api/items/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';

const CreateItemSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = CreateItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const item = await db.item.create({ data: { ...parsed.data, userId: session.user.id } });
  return NextResponse.json({ data: item }, { status: 201 });
}
```

### FastAPI
```python
@router.post("/", response_model=ItemResponse, status_code=201)
async def create_item(
    data: ItemCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = ItemService(db)
    return await service.create(data, owner_id=current_user.id)
```

## Error Handling
- Use custom error classes (not raw `throw new Error()`)
- Catch at route handler level, not deep in service layer
- Log errors with context (request ID, user ID, endpoint)
- Return user-safe messages — never expose internal details

## Pagination
- Cursor-based for real-time data (social feeds, logs)
- Offset-based for stable data (admin tables, reports)
- Always return: `{ data, meta: { total, page, perPage, hasMore } }`
- Default limit: 20, max limit: 100

## Service Layer
- Keep route handlers thin — delegate to service functions
- Services contain business logic, validation rules, orchestration
- Services call repositories/ORM — never raw SQL in handlers
- Services are testable in isolation (inject dependencies)

## Contract Compliance
- Your request/response shapes MUST match the types exported by the Database Architect
- Import shared types — don't redefine them
- If the schema changes, your API shapes must update accordingly
- Document any intentional deviations (e.g., computed fields, omitted sensitive fields)
