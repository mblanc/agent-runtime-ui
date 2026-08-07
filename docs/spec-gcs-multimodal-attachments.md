# Specification: GCS Multimodal File & Image Attachments

## 1. Executive Summary & Goals

This specification details the end-to-end design for adding **Multimodal File and Image Attachments** to **Agent Runtime UI**.

It establishes a **Pre-signed GCS Upload** architecture where files are uploaded directly from the browser to Google Cloud Storage. The resulting `gcsUri` (`gs://...`) references are forwarded to **Google Cloud Agent Runtime (Vertex AI Reasoning Engines)** in `:streamQuery` calls, matching the recommended GCP Agent Development Kit (ADK) multimodal pattern.

---

## 2. Architecture & Data Flow

```text
┌─────────────────┐       1. POST /api/uploads/presign       ┌──────────────────┐
│                 │─────────────────────────────────────────►│ Next.js BFF      │
│                 │                                          │ (Auth & Signing) │
│                 │◄─────────────────────────────────────────│                  │
│                 │       2. { uploadUrl, gcsUri, readUrl }  └──────────────────┘
│  Browser UI     │
│ (assistant-ui) │       3. Parallel HTTP PUT uploads
│                 │─────────────────────────────────────────►┌──────────────────┐
│                 │                                          │ GCS Bucket       │
│                 │       4. POST /api/chat                  │ (gs://my-bucket) │
│                 │          { message: [text, gcsUri] }     └──────────────────┘
│                 │─────────────────────────────────────────►┌──────────────────┐
│                 │                                          │ Agent Runtime    │
└─────────────────┘                                          │ (Vertex AI ADK)  │
                                                             └──────────────────┘
```

### Key Architectural Choices

1. **Zero-Serverless-Memory Offload**: File payload bytes stream directly from browser to GCS.
2. **User Identity Scoping**: Uploads are restricted to `users/{userId}/{uuid}-{filename}`.
3. **Dual URL Strategy**:
   - **`gcsUri` (`gs://...`)**: Passed in the API stream payload to Vertex AI Reasoning Engine.
   - **`readUrl` / Local Blob URL**: Passed to `assistant-ui` for rendering `<img src="..." />` tags in the UI.

---

## 3. Data Contracts & Types (`src/types/agent.ts`)

```typescript
export interface PresignFileRequest {
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export interface PresignBatchRequest {
  files: PresignFileRequest[];
}

export interface PresignedUploadItem {
  fileId: string;
  filename: string;
  contentType: string;
  uploadUrl: string; // HTTP PUT signed URL (Expires in 5m)
  readUrl: string; // HTTP GET signed URL for UI rendering
  gcsUri: string; // gs://bucket/users/{userId}/{fileId}-{filename}
}

export interface PresignBatchResponse {
  uploads: PresignedUploadItem[];
}

export interface GcsFileDataPart {
  file_data: {
    file_uri: string;
    mime_type: string;
  };
}
```

---

## 4. API Endpoints

### 4.1 `POST /api/uploads/presign`

- **Authentication**: Enforces `getAuthSession()` JWT cookie validation.
- **Payload**: `PresignBatchRequest`
- **Behavior**:
  1. Validates `userId` from auth session.
  2. Enforces maximum file size limit (e.g. 50 MB per file) and allowed MIME types (images, PDFs, text, audio, video).
  3. Uses `@google-cloud/storage` SDK to generate cryptographically signed PUT URLs and GET URLs.
- **Response**: `PresignBatchResponse` (Status 200)

### 4.2 `GET /api/uploads/signed-read`

- **Authentication**: Enforces `getAuthSession()` JWT cookie validation.
- **Query Parameters**: `?gcsUri=gs://...`
- **Behavior**: Validates that `gcsUri` belongs to the requesting user (`/users/{userId}/...`), generates a short-lived GET signed URL, and returns `{ readUrl: "https://storage.googleapis.com/..." }`.

---

## 5. Frontend Component & Adapter Wiring

### 5.1 `AttachmentAdapter` (`src/lib/gemini-runtime-adapter.ts`)

- Implements `assistant-ui`'s `AttachmentAdapter` interface.
- **`accept`**: Accepts `image/*, application/pdf, text/*`.
- **`add`**:
  1. Creates an instant local preview Blob URL (`URL.createObjectURL(file)`).
  2. Calls `POST /api/uploads/presign`.
  3. Executes HTTP `PUT` upload directly to `uploadUrl` with progress tracking.
  4. Returns attachment object containing `url` (for UI preview) and `gcsUri` (for model payload).

### 5.2 Composer Attachments (`src/components/assistant-ui/gemini-composer.tsx`)

- Mounts `ComposerPrimitive.Attachments` inside the composer pill.
- Renders file chips with progress indicators, file size, and remove `x` buttons.
- Integrates `AttachmentDropzone` for drag-and-drop file support.

### 5.3 Message Attachments (`src/components/assistant-ui/gemini-message.tsx`)

- Mounts `MessagePrimitive.Attachments` in `ChatMessageImpl`.
- Renders:
  - **Images**: Rounded zoomable thumbnail (`<img src={url} />`).
  - **Documents**: Styled file badge with icon, filename, and download trigger.

---

## 6. GCS Bucket Requirements & Security

### 6.1 GCS CORS Configuration (`cors.json`)

To permit browser-direct `PUT` uploads from the web app origin:

```json
[
  {
    "origin": ["http://localhost:3000", "https://your-domain.app"],
    "method": ["PUT", "GET"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
```

### 6.2 Service Account IAM Roles

The Cloud Run service account must hold:

- `roles/storage.objectAdmin` or `roles/storage.objectCreator` on the target GCS bucket.

---

## 7. Implementation Checklist

- [ ] **Task 1: Types & API Routes**
  - Update `src/types/agent.ts` with presigned upload interfaces.
  - Implement `src/app/api/uploads/presign/route.ts` and `src/app/api/uploads/signed-read/route.ts`.
  - Add API integration tests.

- [ ] **Task 2: Attachment Adapter & Local Storage**
  - Add `attachmentAdapter` in `src/lib/gemini-runtime-adapter.ts`.
  - Handle `Promise.all` parallel direct-to-GCS uploads.

- [ ] **Task 3: Assistant UI Primitives**
  - Add `ComposerPrimitive.Attachments` & `AttachmentDropzone` to `gemini-composer.tsx`.
  - Add `MessagePrimitive.Attachments` to `gemini-message.tsx`.

- [ ] **Task 4: Stream Payload Formatting**
  - Update `/api/chat` and `agent-runtime-client.ts` to map `gcsUri` attachments into `:streamQuery` message parts (`file_data: { file_uri, mime_type }`).

- [ ] **Task 5: End-to-End Testing & Preflight**
  - Add mock unit test for GCS presigned upload in `tests/agent-client.test.ts`.
  - Run `bun run preflight` quality gates.
