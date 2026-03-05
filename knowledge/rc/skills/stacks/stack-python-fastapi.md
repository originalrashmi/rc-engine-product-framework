# Stack: Python + FastAPI

## Project Structure
```
src/
  app/
    main.py           # FastAPI app entry point
    config.py          # Settings via pydantic-settings
    dependencies.py    # Shared Depends() callables
  routers/             # Route modules
    auth.py
    users.py
    items.py
  models/              # SQLAlchemy ORM models
    base.py            # DeclarativeBase
    user.py
    item.py
  schemas/             # Pydantic request/response models
    user.py
    item.py
  services/            # Business logic layer
  db/
    session.py         # Engine + SessionLocal
    migrations/        # Alembic migrations
  utils/               # Helpers
tests/
  conftest.py          # Fixtures
  test_users.py
  test_items.py
alembic.ini
pyproject.toml
```

## Conventions
- Python 3.12+ with type hints everywhere
- Pydantic v2 for all data validation
- Async by default (`async def` endpoints)
- Use `Depends()` for dependency injection
- Keep routers thin — business logic in `services/`

## Database (SQLAlchemy + PostgreSQL)
- SQLAlchemy 2.0 with async engine (`create_async_engine`)
- Use `mapped_column()` and `Mapped[]` type annotations
- Alembic for migrations: `alembic revision --autogenerate -m "description"`
- Session management via `async_sessionmaker` + `Depends(get_db)`

```python
# db/session.py
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.config import settings

engine = create_async_engine(settings.database_url)
AsyncSession = async_sessionmaker(engine, expire_on_commit=False)

async def get_db():
    async with AsyncSession() as session:
        yield session
```

## Authentication
- `python-jose` for JWT token creation/validation
- `passlib[bcrypt]` for password hashing
- OAuth2 password bearer scheme via `Depends(get_current_user)`
- Store refresh tokens in httponly cookies

## API Patterns
```python
# routers/items.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from db.session import get_db
from schemas.item import ItemCreate, ItemResponse
from services.item_service import ItemService

router = APIRouter(prefix="/items", tags=["items"])

@router.get("/", response_model=list[ItemResponse])
async def list_items(db: AsyncSession = Depends(get_db)):
    service = ItemService(db)
    return await service.list_all()

@router.post("/", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
async def create_item(data: ItemCreate, db: AsyncSession = Depends(get_db)):
    service = ItemService(db)
    return await service.create(data)
```

## Validation
- Pydantic models for all request/response schemas
- Use `Field()` for constraints: `Field(min_length=1, max_length=255)`
- Custom validators with `@field_validator`
- Separate Create, Update, and Response schemas

## Testing
- pytest + pytest-asyncio for async tests
- httpx `AsyncClient` for integration tests
- Factory pattern with `factory_boy` or fixtures
- Test database via `TEST_DATABASE_URL` env var

```python
# tests/conftest.py
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
```

## Environment Variables
- `pydantic-settings` with `.env` file support
- `BaseSettings` class in `app/config.py`
- Never hardcode secrets — always use env vars
- Validate all config at startup (fail fast)

## Error Handling
- Custom exception classes inheriting from `HTTPException`
- Global exception handler via `@app.exception_handler`
- Structured error responses: `{"detail": "message", "code": "ERROR_CODE"}`
