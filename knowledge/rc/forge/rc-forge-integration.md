# Integration Engineer - Forge Role Knowledge

## Mission
Wire together Backend and Frontend layers, implement cross-cutting concerns, and ensure the application works as a cohesive whole. You handle auth flows, API client setup, environment configuration, and end-to-end data flow.

## Integration Responsibilities

### 1. API Client Setup
- Create a centralized API client with:
  - Base URL configuration from environment variables
  - Auth token injection (interceptor/middleware)
  - Request/response type safety
  - Error handling and retry logic
  - Request timeout (default 30s)

```typescript
// lib/api-client.ts (Next.js example)
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

async function apiClient<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, error.message);
  }
  return res.json();
}
```

### 2. Authentication Flow
- Login → store token → attach to requests → refresh on expiry → logout
- Handle 401 responses globally (redirect to login)
- Protect client-side routes (middleware or route guards)
- Sync auth state across tabs (if applicable)

### 3. Environment Configuration
- `.env.local` / `.env` files with all required variables
- Validation at startup (fail fast on missing vars)
- Separate configs for development, staging, production
- Never expose server-side secrets to the client

### 4. Error Boundary / Global Error Handling
- Catch unhandled errors at the app level
- Display user-friendly error page (not stack traces)
- Report errors to monitoring (if configured)
- Handle network errors gracefully (offline state)

## Cross-Cutting Patterns

### Retry Logic
```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, backoffMs = 1000): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const isRetryable = err instanceof ApiError && err.status >= 500;
      if (!isRetryable) throw err;
      await new Promise(r => setTimeout(r, backoffMs * Math.pow(2, attempt)));
    }
  }
  throw new Error('Unreachable');
}
```

### Middleware / Interceptors
- Request logging (method, URL, duration)
- Auth token refresh on 401
- Rate limit detection and backoff
- Request ID propagation for tracing

### Data Transformation
- Map API response shapes to UI-friendly shapes
- Handle null/undefined gracefully (default values)
- Date formatting (ISO → locale-specific display)
- Money formatting (cents → display currency)

## Integration Testing Priorities
1. Auth flow: register → login → access protected route → logout
2. CRUD flow: create → read → update → delete for each resource
3. Error handling: invalid input → 422, unauthorized → 401, not found → 404
4. Edge cases: empty lists, max-length inputs, concurrent updates

## Wiring Checklist
- [ ] API base URL configured via environment variable
- [ ] Auth token stored securely (httpOnly cookie or secure storage)
- [ ] All API calls go through centralized client
- [ ] Error responses handled consistently
- [ ] Loading states shown during API calls
- [ ] Form submissions prevent double-submit
- [ ] Navigation updates after successful mutations
- [ ] CORS configured correctly for the frontend origin
- [ ] Environment variables documented in `.env.example`
