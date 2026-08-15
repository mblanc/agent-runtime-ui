# Agent Runtime UI (Gemini Interface for Google Cloud Agent Runtime)

A modern, production-grade web application styled after Google Gemini that connects authenticated users to an ADK (Agent Development Kit) agent running on **Google Cloud Agent Runtime** (Vertex AI Reasoning Engines).

---

## Features

- **Google Gemini Interface Aesthetic**:
  - Centered _"How can I help you today?"_ greeting over an ambient radial glow in the empty state.
  - Floating single-row pill composer with `+` tools menu, dynamic resize input, model selector (`Flash` / `Pro`), voice button, and stateful send/stop button.
  - Avatar-free full-width markdown assistant responses with syntax highlighting, copy action, and collapsible reasoning/thought processes.
  - Right-aligned rounded warm-grey user bubbles.
  - Collapsible multi-thread history sidebar.
- **Authentication**:
  - **Stateless Google Identity (OAuth 2.0)** for Google Workspace and Gmail accounts.
  - 100% Serverless & Cloud Run native: cryptographic signed session cookies (`HttpOnly`, `SameSite=Lax`) with **zero database required** and zero session state mismatch during multi-instance auto-scaling.
- **Backend-For-Frontend (BFF)**:
  - Next.js server route `/api/chat` using Google Cloud Application Default Credentials (`google-auth-library`).
  - Real-time Server-Sent Events (SSE) streaming connecting directly to Vertex AI Reasoning Engine `:streamQuery`.
  - Built-in Mock fallback mode for local testing without active GCP credentials.

---

## Quick Start

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in your Google OAuth and Google Cloud Agent Runtime credentials:

```env
# Authentication
BETTER_AUTH_SECRET=your_32_char_secret_key
BETTER_AUTH_URL=http://localhost:3000

# Google OAuth Credentials (from Google Cloud Console -> APIs & Services -> Credentials)
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret

# Google Cloud Agent Runtime
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_REASONING_ENGINE_ID=projects/PROJECT_NUMBER/locations/us-central1/reasoningEngines/ENGINE_ID

# Optional: Set to true for mock streaming without active GCP credentials
MOCK_AGENT_RUNTIME=false
```

### 3. Run Development Server

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Deployment to Google Cloud Run

Build and deploy directly using Google Cloud Build and Cloud Run:

```bash
# Build container image in Artifact Registry
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/agent-runtime-ui

# Deploy to Cloud Run
gcloud run deploy agent-runtime-ui \
  --image gcr.io/YOUR_PROJECT_ID/agent-runtime-ui \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID,GOOGLE_CLOUD_LOCATION=us-central1,GOOGLE_REASONING_ENGINE_ID=projects/.../reasoningEngines/..."
```
