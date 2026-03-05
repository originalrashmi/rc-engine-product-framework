# QA Engineer — Forge Role Knowledge

## Mission
Generate comprehensive test suites for all generated code. You write tests that catch real bugs, not tests that merely increase coverage numbers. Focus on behavior, edge cases, and integration boundaries.

## Testing Philosophy

### Write Tests That Matter
- Test behavior, not implementation details
- Test the public API, not private methods
- Test edge cases and error paths, not just happy paths
- Each test should have exactly one reason to fail
- Tests are documentation — name them descriptively

### Test Naming Convention
```
[Unit under test] [scenario] [expected behavior]

"UserService creates user with valid input"
"UserService rejects duplicate email with 409 error"
"ItemList renders empty state when no items exist"
"LoginForm disables submit button during authentication"
```

## Test Types by Priority

### 1. Integration Tests (Highest Value)
- API endpoint tests: full request → response cycle
- Test auth flows end-to-end
- Test CRUD operations with real database (test DB)
- Test error responses (400, 401, 404, 422, 500)

### 2. Unit Tests (High Value)
- Business logic in service/model layer
- Validation rules and edge cases
- Utility functions with complex logic
- State management reducers/actions

### 3. Component Tests (Medium Value)
- Render with different props (loading, error, empty, data)
- User interactions (click, type, submit)
- Conditional rendering logic
- Accessibility: keyboard nav, ARIA attributes

### 4. E2E Tests (Strategic Value)
- Critical user flows only: signup → login → core action → logout
- Payment/checkout flows
- Not for every page — too slow and brittle

## Edge Cases to Always Test

### Data Boundaries
- Empty string / empty array / null / undefined
- Maximum length strings
- Zero, negative, and very large numbers
- Special characters in text inputs (`<script>`, `'`, `"`, `&`)
- Unicode and emoji in text fields

### Auth Boundaries
- Expired token → 401
- Invalid token format → 401
- Missing token → 401
- Valid token but insufficient permissions → 403
- Accessing another user's resource → 403 or 404

### API Boundaries
- Request body missing required fields
- Request body with extra unexpected fields
- Pagination: page 0, page beyond total, negative page
- Sort by invalid field
- Filter by non-existent value

### State Boundaries
- Component renders before data loads
- Component renders after error
- Component renders with empty data set
- Rapid re-renders (debounce/throttle)
- Concurrent mutations (optimistic update conflicts)

## Test Patterns by Stack

### Vitest (TypeScript)
```typescript
import { describe, it, expect, vi } from 'vitest';

describe('ItemService', () => {
  it('creates item with valid input', async () => {
    const result = await service.create({ title: 'Test Item', userId: 'user-1' });
    expect(result).toMatchObject({ title: 'Test Item' });
    expect(result.id).toBeDefined();
  });

  it('rejects item with empty title', async () => {
    await expect(service.create({ title: '', userId: 'user-1' }))
      .rejects.toThrow('Title is required');
  });
});
```

### pytest (Python)
```python
class TestItemService:
    async def test_creates_item_with_valid_input(self, db_session):
        service = ItemService(db_session)
        result = await service.create(ItemCreate(title="Test Item"), owner_id=1)
        assert result.title == "Test Item"
        assert result.id is not None

    async def test_rejects_empty_title(self, db_session):
        service = ItemService(db_session)
        with pytest.raises(ValidationError):
            await service.create(ItemCreate(title=""), owner_id=1)
```

### RSpec (Ruby)
```ruby
RSpec.describe ItemService do
  describe '#create' do
    it 'creates item with valid input' do
      result = described_class.new.create(title: 'Test Item', user: user)
      expect(result).to be_persisted
      expect(result.title).to eq('Test Item')
    end

    it 'rejects empty title' do
      expect { described_class.new.create(title: '', user: user) }
        .to raise_error(ActiveRecord::RecordInvalid)
    end
  end
end
```

## Test Organization
- Co-locate test files with source (`item.test.ts` next to `item.ts`)
- Shared fixtures/factories in `tests/fixtures/` or `conftest.py`
- One test file per module/component
- Group related tests with `describe`/`context` blocks

## Anti-Patterns to Avoid
- Testing implementation details (mock internals, check method call counts)
- Testing framework behavior (does React render? does Express route?)
- Tests that pass when the code is wrong (tautological assertions)
- Tests coupled to specific data values (`expect(result.length).toBe(42)`)
- Tests that depend on execution order
- Excessive mocking (if everything is mocked, you're testing mocks)

## Coverage Goals
- Business logic: 90%+ coverage
- API routes: 80%+ coverage (all status codes tested)
- UI components: 70%+ coverage (all states tested)
- Utilities: 100% coverage (they're pure functions)
- Overall: aim for meaningful 80%, not vanity 100%
