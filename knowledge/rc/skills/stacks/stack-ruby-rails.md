# Stack: Ruby + Rails

## Project Structure
```
app/
  controllers/           # Thin controllers
    application_controller.rb
    api/
      v1/               # Versioned API controllers
  models/                # Fat models with validations + scopes
    application_record.rb
    user.rb
  views/                 # ERB templates or Jbuilder
    layouts/
  jobs/                  # Active Job background workers
  mailers/               # Action Mailer classes
  channels/              # Action Cable WebSocket channels
  services/              # Service objects for complex operations
config/
  routes.rb              # RESTful route definitions
  database.yml
  credentials.yml.enc    # Encrypted secrets
db/
  migrate/               # Schema migrations
  schema.rb
  seeds.rb
lib/                     # Non-Rails code, Rake tasks
spec/                    # RSpec tests
  models/
  requests/
  factories/
  support/
Gemfile
```

## Conventions
- Ruby 3.2+ with frozen string literals
- Rails 7.1+ with Hotwire (Turbo + Stimulus)
- Convention over configuration - follow Rails defaults
- RESTful routes: resources, not custom paths
- Fat models, thin controllers - business logic in models or service objects
- Use `Current` attributes for request-scoped globals

## Database (Active Record + PostgreSQL)
- Migrations: `rails generate migration AddFieldToTable field:type`
- Always add indexes for foreign keys and frequently queried columns
- Use `has_many`, `belongs_to`, `has_one` associations
- Scopes for reusable query logic
- `counter_cache` for count optimizations

```ruby
# app/models/user.rb
class User < ApplicationRecord
  has_secure_password
  has_many :items, dependent: :destroy

  validates :email, presence: true, uniqueness: true,
            format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :name, presence: true, length: { maximum: 100 }

  scope :premium, -> { where(premium: true) }
  scope :recent, -> { order(created_at: :desc) }
end
```

## Authentication
- `has_secure_password` for bcrypt-based auth
- Session-based auth for web views
- API tokens or JWT (`jwt` gem) for API auth
- `before_action :authenticate_user!` in controllers
- Devise gem for full-featured auth (optional)

## API Patterns
```ruby
# app/controllers/api/v1/items_controller.rb
module Api
  module V1
    class ItemsController < ApplicationController
      before_action :authenticate_user!
      before_action :set_item, only: [:show, :update, :destroy]

      def index
        @items = current_user.items.recent
        render json: @items
      end

      def create
        @item = current_user.items.build(item_params)
        if @item.save
          render json: @item, status: :created
        else
          render json: { errors: @item.errors }, status: :unprocessable_entity
        end
      end

      private

      def set_item
        @item = current_user.items.find(params[:id])
      end

      def item_params
        params.require(:item).permit(:title, :description)
      end
    end
  end
end
```

## Routes
```ruby
# config/routes.rb
Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      resources :items
      resources :users, only: [:show, :update]
    end
  end

  root "pages#home"
end
```

## Validation
- Model validations: `validates :field, presence: true`
- Strong parameters in controllers (`params.require().permit()`)
- Custom validator classes in `app/validators/`
- Form objects for complex multi-model operations

## Testing (RSpec)
- `rspec-rails` for integration
- `factory_bot_rails` for test data
- `shoulda-matchers` for one-liner model tests
- Request specs for API testing (not controller specs)

```ruby
# spec/requests/api/v1/items_spec.rb
RSpec.describe "Api::V1::Items", type: :request do
  let(:user) { create(:user) }
  let(:headers) { auth_headers(user) }

  describe "GET /api/v1/items" do
    it "returns user items" do
      create_list(:item, 3, user: user)
      get "/api/v1/items", headers: headers
      expect(response).to have_http_status(:ok)
      expect(json_response.size).to eq(3)
    end
  end
end
```

## Environment Variables
- `credentials.yml.enc` for secrets (Rails encrypted credentials)
- `dotenv-rails` gem for development env vars
- `ENV.fetch("KEY")` for required variables (fail fast)
- Never commit `.env` files

## Error Handling
- `rescue_from` in `ApplicationController` for global error handling
- Custom error classes in `app/errors/`
- Structured JSON error responses for API
- `ActiveRecord::RecordNotFound` → 404 automatically

## Frontend Options
- **Hotwire (default)**: Turbo Drive + Turbo Frames + Stimulus
- **API-only**: `rails new --api` with separate SPA
- **ViewComponent**: Component-based views with `view_component` gem
- **Tailwind CSS**: Bundled with Rails 7+ via `cssbundling-rails`
