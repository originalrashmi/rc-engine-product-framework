# Stack: Go + Gin

## Project Structure
```
cmd/
  server/
    main.go              # Entry point, wire dependencies
internal/
  config/
    config.go            # Env-based configuration
  handler/               # HTTP handlers (controllers)
    auth.go
    item.go
    middleware.go
  model/                 # Domain models + DB structs
    user.go
    item.go
  repository/            # Database access layer
    user_repo.go
    item_repo.go
  service/               # Business logic
    user_service.go
    item_service.go
  router/
    router.go            # Route registration
pkg/                     # Shared, reusable packages
  response/
    response.go          # Standard API response helpers
  validator/
    validator.go         # Request validation
migrations/
  000001_init.up.sql
  000001_init.down.sql
go.mod
go.sum
Makefile
```

## Conventions
- Go 1.22+ with generics where appropriate
- `internal/` for application-private code (Go compiler enforced)
- `pkg/` for importable shared code
- Accept interfaces, return structs
- Errors as values - always check `if err != nil`
- No global state - inject dependencies via constructors
- Use `context.Context` for cancellation and request-scoped values

## Database (GORM + PostgreSQL)
- GORM v2 with `gorm.io/gorm` and `gorm.io/driver/postgres`
- `golang-migrate` for schema migrations (not GORM AutoMigrate in prod)
- Repository pattern: one repo per domain model
- Use transactions for multi-step operations

```go
// internal/model/user.go
package model

import (
    "time"
    "gorm.io/gorm"
)

type User struct {
    ID        uint           `gorm:"primarykey" json:"id"`
    Email     string         `gorm:"uniqueIndex;not null" json:"email"`
    Name      string         `gorm:"not null" json:"name"`
    Password  string         `gorm:"-" json:"-"`
    PassHash  string         `gorm:"not null" json:"-"`
    IsPremium bool           `gorm:"default:false" json:"is_premium"`
    CreatedAt time.Time      `json:"created_at"`
    UpdatedAt time.Time      `json:"updated_at"`
    DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}
```

```go
// internal/repository/user_repo.go
package repository

import (
    "context"
    "gorm.io/gorm"
    "myapp/internal/model"
)

type UserRepository struct {
    db *gorm.DB
}

func NewUserRepository(db *gorm.DB) *UserRepository {
    return &UserRepository{db: db}
}

func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*model.User, error) {
    var user model.User
    err := r.db.WithContext(ctx).Where("email = ?", email).First(&user).Error
    if err != nil {
        return nil, err
    }
    return &user, nil
}
```

## Authentication
- JWT via `golang-jwt/jwt/v5`
- Middleware for auth token extraction and validation
- bcrypt for password hashing (`golang.org/x/crypto/bcrypt`)
- Refresh tokens stored in database

## API Patterns
```go
// internal/handler/item.go
package handler

import (
    "net/http"
    "github.com/gin-gonic/gin"
    "myapp/internal/service"
    "myapp/pkg/response"
)

type ItemHandler struct {
    svc *service.ItemService
}

func NewItemHandler(svc *service.ItemService) *ItemHandler {
    return &ItemHandler{svc: svc}
}

func (h *ItemHandler) List(c *gin.Context) {
    items, err := h.svc.ListAll(c.Request.Context())
    if err != nil {
        response.Error(c, http.StatusInternalServerError, err)
        return
    }
    response.Success(c, http.StatusOK, items)
}

func (h *ItemHandler) Create(c *gin.Context) {
    var req CreateItemRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        response.Error(c, http.StatusBadRequest, err)
        return
    }
    item, err := h.svc.Create(c.Request.Context(), req.ToModel())
    if err != nil {
        response.Error(c, http.StatusInternalServerError, err)
        return
    }
    response.Success(c, http.StatusCreated, item)
}
```

## Routes
```go
// internal/router/router.go
package router

import "github.com/gin-gonic/gin"

func Setup(r *gin.Engine, h *handler.ItemHandler, auth gin.HandlerFunc) {
    api := r.Group("/api/v1")
    {
        api.POST("/auth/login", authHandler.Login)
        api.POST("/auth/register", authHandler.Register)

        protected := api.Group("")
        protected.Use(auth)
        {
            protected.GET("/items", h.List)
            protected.POST("/items", h.Create)
            protected.GET("/items/:id", h.GetByID)
            protected.PUT("/items/:id", h.Update)
            protected.DELETE("/items/:id", h.Delete)
        }
    }
}
```

## Validation
- Gin's `ShouldBindJSON` with struct tags: `binding:"required,min=1,max=255"`
- Custom validators registered with `validator.v10`
- Request structs separate from domain models
- Validate at handler level, never in service/repo

## Testing
- Standard `testing` package + `testify` for assertions
- `httptest` for HTTP handler tests
- Table-driven tests (Go convention)
- Test database via `TEST_DATABASE_URL`

```go
// internal/handler/item_test.go
func TestListItems(t *testing.T) {
    router := setupTestRouter()

    w := httptest.NewRecorder()
    req, _ := http.NewRequest("GET", "/api/v1/items", nil)
    req.Header.Set("Authorization", "Bearer "+testToken)
    router.ServeHTTP(w, req)

    assert.Equal(t, http.StatusOK, w.Code)
}
```

## Environment Variables
- `os.Getenv()` or `viper` for configuration
- Struct-based config loaded at startup (`internal/config/config.go`)
- Fail fast on missing required variables
- Never hardcode secrets

## Error Handling
- Custom error types implementing `error` interface
- Wrap errors with `fmt.Errorf("context: %w", err)` for stack traces
- Centralized error response middleware
- Structured JSON: `{"error": "message", "code": "ERROR_CODE"}`
- Use `errors.Is()` and `errors.As()` for error checking

## Build & Deploy
- `Makefile` for common commands: `make build`, `make test`, `make migrate`
- Multi-stage Dockerfile for minimal prod image
- `go build -o bin/server cmd/server/main.go`
- Health check endpoint at `/health`
