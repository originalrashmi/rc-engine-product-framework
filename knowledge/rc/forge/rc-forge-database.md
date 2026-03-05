# Database Architect — Forge Role Knowledge

## Mission
Design production-grade database schemas that serve as the **contract foundation** for all other agents. Every table, column, index, and constraint you define becomes the source of truth for Backend and Frontend layers.

## Schema Design Principles

### 1. Normalize First, Denormalize With Intent
- Start with 3NF (Third Normal Form)
- Only denormalize for proven performance needs (read-heavy aggregations)
- Document every denormalization decision

### 2. Type Safety at the Database Level
- Use ENUMs for status fields (not arbitrary strings)
- Use `uuid` for public-facing IDs, `bigint` for internal references
- Use `jsonb` (PostgreSQL) sparingly — only for truly flexible schemas
- Never use `varchar(255)` as a default — size columns to their actual domain

### 3. Temporal Data
- Every table gets `created_at` and `updated_at` (auto-managed)
- Use `deleted_at` (soft delete) for user-facing records that may need recovery
- Use actual `DELETE` for transient data (sessions, temp tokens)

### 4. Relationships
- Always define foreign keys with explicit `ON DELETE` behavior
- `CASCADE` for child records that don't exist without parent
- `SET NULL` for optional associations
- `RESTRICT` for critical references that shouldn't be orphaned
- Add indexes on all foreign key columns

### 5. Indexing Strategy
- Primary keys are indexed automatically
- Add indexes on: foreign keys, `WHERE` clause targets, `ORDER BY` fields
- Composite indexes: most selective column first
- Partial indexes for common filtered queries (e.g., `WHERE status = 'active'`)
- Don't over-index — each index slows writes

## ORM-Specific Patterns

### Prisma (TypeScript)
```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String
  role      Role     @default(USER)
  items     Item[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([email])
  @@map("users")
}

enum Role {
  USER
  ADMIN
}
```

### SQLAlchemy (Python)
```python
class User(Base):
    __tablename__ = "users"
    id = mapped_column(UUID, primary_key=True, default=uuid4)
    email = mapped_column(String(255), unique=True, nullable=False, index=True)
    name = mapped_column(String(100), nullable=False)
    role = mapped_column(Enum(UserRole), default=UserRole.USER)
    items = relationship("Item", back_populates="owner", cascade="all, delete-orphan")
    created_at = mapped_column(DateTime, server_default=func.now())
    updated_at = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
```

### Active Record (Ruby)
```ruby
class CreateUsers < ActiveRecord::Migration[7.1]
  def change
    create_table :users, id: :uuid do |t|
      t.string :email, null: false, index: { unique: true }
      t.string :name, null: false
      t.integer :role, default: 0, null: false
      t.timestamps
    end
  end
end
```

### GORM (Go)
```go
type User struct {
    ID        uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    Email     string         `gorm:"uniqueIndex;not null"`
    Name      string         `gorm:"not null"`
    Role      UserRole       `gorm:"default:user"`
    Items     []Item         `gorm:"foreignKey:OwnerID"`
    CreatedAt time.Time
    UpdatedAt time.Time
    DeletedAt gorm.DeletedAt `gorm:"index"`
}
```

## Seed Data Rules
- Always generate realistic seed data (not "test1", "foo", "bar")
- Include edge cases: max-length strings, null optional fields, all enum values
- Create relationship chains (user → items → sub-items)
- Seed admin user with known credentials for development
- Separate seed scripts: `seed-dev.sql` (rich data) vs `seed-prod.sql` (admin only)

## Migration Safety
- Never rename columns — add new column, migrate data, drop old column
- Never drop tables with data — add deprecation marker first
- Always make migrations reversible (up + down)
- Test migrations against production-size data before deploying

## Contract Output
Your PRIMARY output is the type definitions that other agents import:
- TypeScript: `.d.ts` files or `types.ts` with exported interfaces
- Python: Pydantic schemas mirroring ORM models
- Go: Exported struct types
- Ruby: Type signatures in YARD comments

These types ARE the contract. Backend agent builds API routes against them. Frontend agent builds forms against them.
