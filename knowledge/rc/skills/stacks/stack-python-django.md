# Stack: Python + Django

## Project Structure
```
project_name/
  manage.py
  config/               # Project settings (renamed from default)
    __init__.py
    settings/
      base.py            # Shared settings
      development.py     # Dev overrides
      production.py      # Prod overrides
    urls.py              # Root URL conf
    wsgi.py
    asgi.py
  apps/
    accounts/            # User auth app
      models.py
      views.py
      serializers.py     # DRF serializers
      urls.py
      admin.py
      tests/
    core/                # Shared utilities
  templates/             # Django templates (if SSR)
  static/                # Static files
  media/                 # User uploads
tests/
  conftest.py
requirements/
  base.txt
  dev.txt
  prod.txt
```

## Conventions
- Python 3.12+ with type hints
- Django 5.x with async view support where beneficial
- Django REST Framework (DRF) for API endpoints
- One Django app per domain/bounded context
- Fat models, thin views — business logic in models or service layer
- Use `django-environ` for environment variable management

## Database (Django ORM + PostgreSQL)
- Models in `models.py` with explicit `Meta` class
- Use `makemigrations` + `migrate` (never modify migrations by hand)
- Custom user model from day one (`AbstractUser` or `AbstractBaseUser`)
- Use `select_related()` and `prefetch_related()` to avoid N+1 queries
- Database indexes on frequently queried fields

```python
# apps/accounts/models.py
from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    email = models.EmailField(unique=True)
    is_premium = models.BooleanField(default=False)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    class Meta:
        ordering = ['-date_joined']
```

## Authentication
- `django-allauth` for social auth + email verification
- DRF token auth or `djangorestframework-simplejwt` for API auth
- Custom user model set in `AUTH_USER_MODEL`
- Permission classes on all API views

## API Patterns (Django REST Framework)
```python
# apps/items/views.py
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from .models import Item
from .serializers import ItemSerializer

class ItemViewSet(viewsets.ModelViewSet):
    queryset = Item.objects.all()
    serializer_class = ItemSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)
```

```python
# apps/items/serializers.py
from rest_framework import serializers
from .models import Item

class ItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = Item
        fields = ['id', 'title', 'description', 'created_at']
        read_only_fields = ['id', 'created_at']
```

## URL Configuration
```python
# config/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.items.views import ItemViewSet

router = DefaultRouter()
router.register(r'items', ItemViewSet)

urlpatterns = [
    path('api/', include(router.urls)),
    path('api/auth/', include('dj_rest_auth.urls')),
    path('admin/', admin.site.urls),
]
```

## Validation
- DRF serializers for request/response validation
- Model-level validation with `clean()` and `validators`
- Form validation for template-rendered views
- Custom validator functions in `validators.py`

## Testing
- pytest + pytest-django
- `APIClient` for DRF endpoint tests
- `factory_boy` for test data factories
- Fixtures in `conftest.py`

```python
# tests/conftest.py
import pytest
from rest_framework.test import APIClient

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def authenticated_client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client
```

## Environment Variables
- `django-environ` with `.env` file
- `env.bool()`, `env.int()`, `env.list()` for typed access
- Never hardcode `SECRET_KEY`, `DATABASE_URL`, or credentials
- Validate required vars at startup in settings

## Error Handling
- DRF exception handler for API errors
- Custom exception classes for domain errors
- `@api_view` decorator for function-based views with proper error responses
- Logging via Python `logging` module with structured output

## Frontend Options
- **API-only**: DRF + separate SPA (React, Vue)
- **SSR**: Django Templates + HTMX + Alpine.js
- **Hybrid**: Django Templates for pages, DRF for dynamic data
