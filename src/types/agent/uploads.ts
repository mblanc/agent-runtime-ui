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

export interface SignedReadResponse {
  readUrl: string;
}
