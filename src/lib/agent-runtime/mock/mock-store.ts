import {
  AgentSession,
  AgentSessionEvent,
  DeployedAgent,
} from "@/types/agent";

export const mockAgentsStore: DeployedAgent[] = [
  {
    id: "mock-arch-advisor",
    resourceName:
      "projects/mock-project/locations/us-central1/reasoningEngines/mock-arch-advisor",
    displayName: "ADK Architecture Advisor",
    description:
      "Specialized in cloud architecture patterns, scalability, and security best practices",
    location: "us-central1",
    model: "gemini-2.5-pro",
    isDefault: true,
    createTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updateTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "mock-code-reviewer",
    resourceName:
      "projects/mock-project/locations/europe-west4/reasoningEngines/mock-code-reviewer",
    displayName: "Code Reviewer & Auditor",
    description:
      "Automated code review, security audits, and style compliance for enterprise repos",
    location: "europe-west4",
    model: "gemini-2.5-flash",
    isDefault: false,
    createTime: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    updateTime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "mock-cloud-ops",
    resourceName:
      "projects/mock-project/locations/us-central1/reasoningEngines/mock-cloud-ops",
    displayName: "Cloud Ops Assistant",
    description:
      "Infrastructure monitoring, log analysis, and incident triage for GCP environments",
    location: "us-central1",
    model: "gemini-2.5-flash",
    isDefault: false,
    createTime: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    updateTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export const mockSessionsStore = new Map<string, AgentSession>([
  [
    "1",
    {
      id: "1",
      name: "projects/mock-project/locations/us-central1/reasoningEngines/mock-arch-advisor/sessions/1",
      userId: "test-user",
      title: "ADK Agent Architecture",
      createTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      updateTime: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
  ],
  [
    "2",
    {
      id: "2",
      name: "projects/mock-project/locations/us-central1/reasoningEngines/mock-arch-advisor/sessions/2",
      userId: "test-user",
      title: "Architecture Review",
      createTime: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
      updateTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    },
  ],
  [
    "3",
    {
      id: "3",
      name: "projects/mock-project/locations/europe-west4/reasoningEngines/mock-code-reviewer/sessions/3",
      userId: "test-user",
      title: "PR #42 Security Audit",
      createTime: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      updateTime: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    },
  ],
  [
    "4",
    {
      id: "4",
      name: "projects/mock-project/locations/us-central1/reasoningEngines/mock-cloud-ops/sessions/4",
      userId: "test-user",
      title: "GKE Cluster High Memory Alert",
      createTime: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
      updateTime: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
    },
  ],
]);

export const mockSessionEventsStore = new Map<string, AgentSessionEvent[]>([
  [
    "1",
    [
      {
        id: "evt-1-1",
        sessionId: "1",
        role: "user",
        content: "What is the recommended architecture for a multi-agent ADK system?",
        createTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "evt-1-2",
        sessionId: "1",
        role: "assistant",
        content:
          "In Google Cloud ADK, we recommend structuring agents using Vertex AI Reasoning Engines with hierarchical subagents and stateless BFF proxy orchestration.",
        thought:
          "Analyzing Google ADK multi-agent architecture guidelines and best practices...",
        createTime: new Date(Date.now() - 2 * 60 * 60 * 1000 + 5000).toISOString(),
      },
    ],
  ],
  [
    "2",
    [
      {
        id: "evt-2-1",
        sessionId: "2",
        role: "user",
        content: "Review the cloud run container security configurations.",
        createTime: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "evt-2-2",
        sessionId: "2",
        role: "assistant",
        content:
          "Container security review completed: Non-root execution enabled, read-only root filesystem configured, and minimal IAM permissions verified.",
        createTime: new Date(Date.now() - 26 * 60 * 60 * 1000 + 4000).toISOString(),
      },
    ],
  ],
  [
    "3",
    [
      {
        id: "evt-3-1",
        sessionId: "3",
        role: "user",
        content:
          "Please audit the authentication middleware PR #42 for potential vulnerabilities.",
        createTime: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "evt-3-2",
        sessionId: "3",
        role: "assistant",
        content:
          "Security audit of PR #42 completed. Found 0 critical issues and 1 suggestion regarding token expiration handling.",
        thought: "Reviewing AST, checking JWT verification and timing attack vectors...",
        createTime: new Date(Date.now() - 5 * 60 * 60 * 1000 + 4000).toISOString(),
      },
    ],
  ],
  [
    "4",
    [
      {
        id: "evt-4-1",
        sessionId: "4",
        role: "user",
        content:
          "Check why nodes in us-central1-a are experiencing high memory pressure.",
        createTime: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "evt-4-2",
        sessionId: "4",
        role: "assistant",
        content:
          "Identified a memory leak in the metrics-collector daemonset causing buffer bloat. Recommend restarting the pod and updating resource limits.",
        thought:
          "Querying Cloud Monitoring metrics and node daemonset memory consumption logs...",
        createTime: new Date(Date.now() - 8 * 60 * 60 * 1000 + 3500).toISOString(),
      },
    ],
  ],
]);
