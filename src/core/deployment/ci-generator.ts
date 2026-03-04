/**
 * CI/CD Configuration Generator
 *
 * Generates deployment configurations based on project stack:
 * - GitHub Actions workflows (CI, CD, release)
 * - Dockerfile for containerized deployment
 * - docker-compose.yml for local development
 *
 * Templates are stack-aware: Node.js detection, framework detection
 * (Next.js, Express, Vite), and platform targeting (Vercel, Railway, Fly.io).
 */

import fs from 'node:fs';
import path from 'node:path';

// ── Types ───────────────────────────────────────────────────────────────────

export type DeployTarget = 'docker' | 'vercel' | 'railway' | 'fly';
export type FrameworkType = 'nextjs' | 'express' | 'vite-spa' | 'generic-node';

export interface ProjectProfile {
  name: string;
  framework: FrameworkType;
  hasTypeScript: boolean;
  hasPrisma: boolean;
  nodeVersion: string;
  port: number;
}

export interface GeneratedConfig {
  filename: string;
  content: string;
  description: string;
}

// ── Stack Detection ─────────────────────────────────────────────────────────

export function detectProjectProfile(projectPath: string): ProjectProfile {
  const pkg = readPkg(projectPath);

  const name = (pkg?.name as string) || path.basename(projectPath);
  const deps = {
    ...(pkg?.dependencies as Record<string, string> | undefined),
    ...(pkg?.devDependencies as Record<string, string> | undefined),
  };

  let framework: FrameworkType = 'generic-node';
  if (deps['next']) framework = 'nextjs';
  else if (deps['express'] || deps['fastify'] || deps['koa']) framework = 'express';
  else if (deps['vite'] && (deps['react'] || deps['vue'] || deps['svelte'])) framework = 'vite-spa';

  const hasTypeScript = !!deps['typescript'] || fs.existsSync(path.join(projectPath, 'tsconfig.json'));
  const hasPrisma = !!deps['prisma'] || !!deps['@prisma/client'];

  let nodeVersion = '20';
  const engines = pkg?.engines as Record<string, string> | undefined;
  if (engines?.node) {
    const match = engines.node.match(/(\d+)/);
    if (match) nodeVersion = match[1];
  }

  // Try to detect port
  let port = 3000;
  if (framework === 'express') port = 3000;
  if (framework === 'nextjs') port = 3000;
  if (framework === 'vite-spa') port = 4173;

  return { name, framework, hasTypeScript, hasPrisma, nodeVersion, port };
}

// ── Generators ──────────────────────────────────────────────────────────────

export function generateConfigs(projectPath: string, targets: DeployTarget[]): GeneratedConfig[] {
  const profile = detectProjectProfile(projectPath);
  const configs: GeneratedConfig[] = [];

  // Always generate CI workflow
  configs.push(generateCIWorkflow(profile));

  for (const target of targets) {
    switch (target) {
      case 'docker':
        configs.push(generateDockerfile(profile));
        configs.push(generateDockerCompose(profile));
        configs.push(generateDockerIgnore());
        break;
      case 'vercel':
        configs.push(generateVercelConfig(profile));
        break;
      case 'railway':
        configs.push(generateRailwayConfig(profile));
        break;
      case 'fly':
        configs.push(generateFlyConfig(profile));
        break;
    }
  }

  // CD workflow if deploying
  if (targets.length > 0) {
    configs.push(generateCDWorkflow(profile, targets[0]));
  }

  return configs;
}

/** Write generated configs to disk (does not overwrite existing). */
export function writeConfigs(
  projectPath: string,
  configs: GeneratedConfig[],
  overwrite = false,
): { written: string[]; skipped: string[] } {
  const written: string[] = [];
  const skipped: string[] = [];

  for (const config of configs) {
    const fullPath = path.join(projectPath, config.filename);
    if (fs.existsSync(fullPath) && !overwrite) {
      skipped.push(config.filename);
      continue;
    }

    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, config.content, 'utf-8');
    written.push(config.filename);
  }

  return { written, skipped };
}

// ── Template Generators ─────────────────────────────────────────────────────

function generateCIWorkflow(profile: ProjectProfile): GeneratedConfig {
  const buildCmd = profile.hasTypeScript ? 'npm run build' : 'echo "No build step"';

  return {
    filename: '.github/workflows/ci.yml',
    description: 'CI pipeline with type checking, linting, and tests',
    content: `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js \${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
          cache: npm

      - name: Install dependencies
        run: npm ci
${profile.hasPrisma ? '\n      - name: Generate Prisma client\n        run: npx prisma generate\n' : ''}
      - name: Build
        run: ${buildCmd}

      - name: Lint
        run: npm run lint --if-present

      - name: Test
        run: npm test --if-present
`,
  };
}

function generateCDWorkflow(profile: ProjectProfile, target: DeployTarget): GeneratedConfig {
  let deployStep = '';

  switch (target) {
    case 'docker':
      deployStep = `      - name: Build and push Docker image
        run: |
          docker build -t \${{ secrets.REGISTRY }}/${profile.name}:\${{ github.sha }} .
          docker push \${{ secrets.REGISTRY }}/${profile.name}:\${{ github.sha }}`;
      break;
    case 'vercel':
      deployStep = `      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: \${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: \${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: \${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: --prod`;
      break;
    case 'railway':
      deployStep = `      - name: Deploy to Railway
        uses: bervProject/railway-deploy@main
        with:
          railway_token: \${{ secrets.RAILWAY_TOKEN }}
          service: ${profile.name}`;
      break;
    case 'fly':
      deployStep = `      - name: Deploy to Fly.io
        uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: \${{ secrets.FLY_API_TOKEN }}`;
      break;
  }

  return {
    filename: '.github/workflows/cd.yml',
    description: `CD pipeline for ${target} deployment`,
    content: `name: CD

on:
  push:
    tags: ['v*']

jobs:
  deploy:
    runs-on: ubuntu-latest
    needs: []
    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js ${profile.nodeVersion}
        uses: actions/setup-node@v4
        with:
          node-version: ${profile.nodeVersion}
          cache: npm

      - name: Install and build
        run: |
          npm ci
          npm run build --if-present

${deployStep}
`,
  };
}

function generateDockerfile(profile: ProjectProfile): GeneratedConfig {
  const buildStage =
    profile.framework === 'vite-spa'
      ? `
# Build stage
FROM node:${profile.nodeVersion}-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage -- serve static files
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`
      : `
# Build stage
FROM node:${profile.nodeVersion}-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
${profile.hasTypeScript ? 'RUN npm run build' : ''}
${profile.hasPrisma ? 'RUN npx prisma generate' : ''}

# Production stage
FROM node:${profile.nodeVersion}-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
${profile.hasTypeScript ? 'COPY --from=builder /app/dist ./dist' : 'COPY --from=builder /app/src ./src'}
${profile.hasPrisma ? 'COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma\nCOPY prisma ./prisma' : ''}
EXPOSE ${profile.port}
USER node
CMD ["node", "${profile.hasTypeScript ? 'dist' : 'src'}/index.js"]`;

  return {
    filename: 'Dockerfile',
    description: 'Multi-stage Docker build for production',
    content: buildStage.trimStart() + '\n',
  };
}

function generateDockerCompose(profile: ProjectProfile): GeneratedConfig {
  let services = `services:
  app:
    build: .
    ports:
      - "${profile.port}:${profile.port}"
    env_file:
      - .env
    restart: unless-stopped`;

  if (profile.hasPrisma) {
    services += `
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${profile.name}
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:`;
  }

  return {
    filename: 'docker-compose.yml',
    description: 'Docker Compose for local development',
    content: services + '\n',
  };
}

function generateDockerIgnore(): GeneratedConfig {
  return {
    filename: '.dockerignore',
    description: 'Docker build exclusions',
    content: `node_modules
.git
.env
.env.*
dist
*.md
.github
tests
coverage
.vscode
.idea
*.log
`,
  };
}

function generateVercelConfig(profile: ProjectProfile): GeneratedConfig {
  const config: Record<string, unknown> = {
    $schema: 'https://openapi.vercel.sh/vercel.json',
  };

  if (profile.framework === 'express') {
    config.rewrites = [{ source: '/(.*)', destination: '/api' }];
  }

  return {
    filename: 'vercel.json',
    description: 'Vercel deployment configuration',
    content: JSON.stringify(config, null, 2) + '\n',
  };
}

function generateRailwayConfig(profile: ProjectProfile): GeneratedConfig {
  return {
    filename: 'railway.json',
    description: 'Railway deployment configuration',
    content:
      JSON.stringify(
        {
          $schema: 'https://railway.app/railway.schema.json',
          build: { builder: 'NIXPACKS' },
          deploy: {
            startCommand: profile.hasTypeScript ? 'node dist/index.js' : 'node src/index.js',
            healthcheckPath: '/health',
            restartPolicyType: 'ON_FAILURE',
          },
        },
        null,
        2,
      ) + '\n',
  };
}

function generateFlyConfig(profile: ProjectProfile): GeneratedConfig {
  return {
    filename: 'fly.toml',
    description: 'Fly.io deployment configuration',
    content: `app = "${profile.name}"
primary_region = "iad"

[build]

[http_service]
  internal_port = ${profile.port}
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

[checks]
  [checks.health]
    port = ${profile.port}
    type = "http"
    interval = "15s"
    timeout = "2s"
    path = "/health"
`,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function readPkg(projectPath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8'));
  } catch {
    return null;
  }
}
