import {
  AgentArtifact,
  AgentMemory,
  AgentSession,
  AgentSessionEvent,
  DeployedAgent,
  SessionStateMap,
} from "@/types/agent";

export const mockSessionStateStore = new Map<string, SessionStateMap>([
  [
    "1",
    {
      target_cluster: "prod-europe-west1",
      deployment_status: "active",
      active_services: ["frontend", "worker", "auth-proxy"],
      run_config: { min_instances: 2, memory: "4GiB", cpu: 2 },
    },
  ],
  [
    "2",
    {
      compliance_checked: true,
      security_tier: "enterprise_high",
      reviewed_commits: 14,
    },
  ],
  [
    "3",
    {
      pr_number: 42,
      audit_status: "passed_with_suggestions",
      scanned_files_count: 8,
    },
  ],
  [
    "4",
    {
      cluster_name: "gke-europe-west4-prod",
      alert_status: "mitigated",
      oom_kill_count: 0,
    },
  ],
]);

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
  {
    id: "mock-generic-agent",
    resourceName:
      "projects/mock-project/locations/us-central1/reasoningEngines/mock-generic-agent",
    displayName: "Generic Agent",
    description:
      "Multi-purpose reasoning engine with human-in-the-loop confirmation capabilities",
    location: "us-central1",
    model: "gemini-2.5-pro",
    isDefault: false,
    createTime: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updateTime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export const mockSessionsStore = new Map<string, AgentSession>([
  [
    "7547932851195346944",
    {
      id: "7547932851195346944",
      name: "projects/svc-demo-vertex/locations/us-central1/reasoningEngines/3817127788905758720/sessions/7547932851195346944",
      userId: "test-user",
      title: "Marseille Weather & Graph",
      createTime: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      updateTime: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    },
  ],
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
  [
    "2648707499674304512",
    {
      id: "2648707499674304512",
      name: "projects/mock-project/locations/us-central1/reasoningEngines/mock-generic-agent/sessions/2648707499674304512",
      userId: "test-user",
      title: "Summarize https://yongzx.github.io/blog/2026/08/08/llm-can-jump",
      createTime: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      updateTime: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    },
  ],
]);

export const mockSessionEventsStore = new Map<string, AgentSessionEvent[]>([
  [
    "7547932851195346944",
    [
      {
        id: "evt-7547932851195346944-1",
        sessionId: "7547932851195346944",
        role: "user",
        content:
          "look a the weather in the nex days in Marseille and execute some code to generate a graph of it",
        createTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
      {
        id: "evt-7547932851195346944-2",
        sessionId: "7547932851195346944",
        role: "assistant",
        content:
          "Here is the weather forecast for Marseille for the next days:\n\n- **Tuesday**: 24°C, Sunny ☀️\n- **Wednesday**: 26°C, Clear ☀️\n- **Thursday**: 27°C, Sunny ☀️\n- **Friday**: 25°C, Partly Cloudy ⛅\n- **Saturday**: 26°C, Sunny ☀️\n- **Sunday**: 28°C, Clear ☀️\n\nI have executed Python code to generate a temperature graph visualizing the forecast above.",
        thought:
          "Looking up weather forecast for Marseille and executing Python code to plot temperature trends...",
        codeExecutionBlocks: [
          {
            id: "code-7547932851195346944-1",
            language: "PYTHON",
            code: "import matplotlib.pyplot as plt\n\ndays = ['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']\ntemps = [24, 26, 27, 25, 26, 28]\n\nplt.figure(figsize=(8, 4))\nplt.plot(days, temps, marker='o', color='#1a73e8', linewidth=2.5, label='Temperature (°C)')\nplt.title('Marseille Weather Forecast - Next 6 Days')\nplt.xlabel('Day')\nplt.ylabel('Temperature (°C)')\nplt.grid(True, linestyle='--', alpha=0.6)\nplt.legend()\nplt.tight_layout()\nplt.show()",
            status: "complete",
            result: {
              outcome: "OUTCOME_OK",
              output:
                "Plot generated successfully.\ndata:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
              durationMs: 145,
              generatedImages: [
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
              ],
            },
          },
        ],
        artifacts: [
          {
            filename: "marseille_weather_forecast.png",
            title: "Marseille Weather Forecast Graph",
            mimeType: "image/png",
            version: 0,
            content:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            isComplete: true,
          },
        ],
        createTime: new Date(Date.now() - 59 * 60 * 1000).toISOString(),
      },
    ],
  ],
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
  [
    "2648707499674304512",
    [
      {
        id: "evt-hitl-1",
        sessionId: "2648707499674304512",
        role: "user",
        content: "Please summarize https://yongzx.github.io/blog/2026/08/08/llm-can-jump",
        createTime: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "evt-hitl-2",
        sessionId: "2648707499674304512",
        role: "assistant",
        content: "",
        thought:
          "Analyzing external webpage request: loading external URL requires human-in-the-loop authorization...",
        tool_calls: [
          {
            id: "adk-e2c91d21-81f4-40b1-b654-40c3919729da",
            name: "adk_request_confirmation",
            args: {
              originalFunctionCall: {
                id: "adk-cab96561-1849-4cd4-8bf6-dae511652d03",
                name: "load_web_page",
                args: {
                  url: "https://yongzx.github.io/blog/2026/08/08/llm-can-jump",
                },
              },
              toolConfirmation: {
                hint: "Approval Required: The agent requests permission to execute 'load_web_page' with arguments: {'url': 'https://yongzx.github.io/blog/2026/08/08/llm-can-jump'}.",
                confirmed: false,
                payload: {
                  tool_name: "load_web_page",
                  args: {
                    url: "https://yongzx.github.io/blog/2026/08/08/llm-can-jump",
                  },
                },
              },
            },
          },
        ],
        createTime: new Date(Date.now() - 1 * 60 * 60 * 1000 + 3000).toISOString(),
      },
    ],
  ],
]);

export const mockMemoriesStore = new Map<string, AgentMemory>([
  [
    "mem-1",
    {
      id: "mem-1",
      userId: "test-user",
      fact: "Prefers TypeScript with strict typing over vanilla JS",
      topic: "coding_preferences",
      confidenceScore: 0.95,
      createTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      updateTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      lastUsedTime: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    },
  ],
  [
    "mem-2",
    {
      id: "mem-2",
      userId: "test-user",
      fact: "Always uses Bun package manager and Tailwind CSS v3",
      topic: "coding_preferences",
      confidenceScore: 0.98,
      createTime: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      updateTime: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      lastUsedTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
  ],
  [
    "mem-3",
    {
      id: "mem-3",
      userId: "test-user",
      fact: "Project Lead for Cloud Migration in europe-west1",
      topic: "enterprise_context",
      confidenceScore: 0.9,
      createTime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      updateTime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      lastUsedTime: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    },
  ],
  [
    "mem-4",
    {
      id: "mem-4",
      userId: "test-user",
      fact: "Uses Vertex AI Agent Runtime with PKCE authentication",
      topic: "enterprise_context",
      confidenceScore: 0.92,
      createTime: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      updateTime: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      lastUsedTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    },
  ],
  [
    "mem-5",
    {
      id: "mem-5",
      userId: "test-user",
      fact: "Prefers concise technical explanations with code diffs",
      topic: "communication_style",
      confidenceScore: 0.88,
      createTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      updateTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      lastUsedTime: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    },
  ],
]);

export const mockArtifactsStore = new Map<string, AgentArtifact[]>([
  [
    "7547932851195346944",
    [
      {
        id: "marseille_weather_forecast.png",
        sessionId: "7547932851195346944",
        userId: "test-user",
        filename: "marseille_weather_forecast.png",
        title: "Marseille Weather Forecast Graph",
        mimeType: "image/png",
        currentVersion: 0,
        createTime: new Date(Date.now() - 59 * 60 * 1000).toISOString(),
        updateTime: new Date(Date.now() - 59 * 60 * 1000).toISOString(),
        scope: "session",
        versions: [
          {
            version: 0,
            content:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            sizeBytes: 120,
            mimeType: "image/png",
            createTime: new Date(Date.now() - 59 * 60 * 1000).toISOString(),
          },
        ],
      },
    ],
  ],
  [
    "1",
    [
      {
        id: "sales_dashboard.html",
        sessionId: "1",
        userId: "test-user",
        filename: "sales_dashboard.html",
        title: "Quarterly Sales Performance Dashboard",
        mimeType: "text/html",
        currentVersion: 2,
        createTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        updateTime: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        scope: "session",
        versions: [
          {
            version: 0,
            content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Sales Dashboard v0</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; background: #f8fafc; color: #1e293b; }
    .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 16px; }
    h1 { font-size: 20px; margin-top: 0; color: #0f172a; }
    .metric { font-size: 32px; font-weight: bold; color: #2563eb; }
  </style>
</head>
<body>
  <h1>Quarterly Sales Overview (Draft)</h1>
  <div class="card">
    <div>Total Revenue</div>
    <div class="metric">$124,500</div>
  </div>
  <div class="card">
    <div>Deals Closed</div>
    <div class="metric">48</div>
  </div>
</body>
</html>`,
            createTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            sizeBytes: 680,
            mimeType: "text/html",
          },
          {
            version: 1,
            content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Sales Dashboard v1</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; background: #f8fafc; color: #1e293b; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .metric { font-size: 28px; font-weight: bold; color: #2563eb; margin-top: 4px; }
    .chart-box { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  </style>
</head>
<body>
  <h1 style="font-size: 22px; margin-bottom: 20px;">Q3 Sales Performance Dashboard</h1>
  <div class="grid">
    <div class="card"><div>Total Revenue</div><div class="metric">$142,800</div></div>
    <div class="card"><div>Target Attainment</div><div class="metric">114.2%</div></div>
    <div class="card"><div>Active Pipeline</div><div class="metric">$480,000</div></div>
  </div>
  <div class="chart-box">
    <canvas id="salesChart" height="100"></canvas>
  </div>
  <script>
    const ctx = document.getElementById('salesChart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Jul', 'Aug', 'Sep'],
        datasets: [{ label: 'Revenue ($k)', data: [42, 48, 52.8], backgroundColor: '#3b82f6' }]
      }
    });
  </script>
</body>
</html>`,
            createTime: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
            sizeBytes: 1540,
            mimeType: "text/html",
          },
          {
            version: 2,
            content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sales Performance Workspace</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root { --bg: #f8fafc; --card: #ffffff; --text: #0f172a; --text-muted: #64748b; --primary: #2563eb; --accent: #10b981; --border: #e2e8f0; }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #0f172a; --card: #1e293b; --text: #f8fafc; --text-muted: #94a3b8; --primary: #60a5fa; --accent: #34d399; --border: #334155; }
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); padding: 24px; margin: 0; transition: background 0.3s, color 0.3s; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .title { font-size: 24px; font-weight: 700; }
    .badge { background: rgba(37,99,235,0.1); color: var(--primary); padding: 4px 12px; border-radius: 9999px; font-size: 13px; font-weight: 600; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .kpi-card { background: var(--card); border: 1px solid var(--border); padding: 20px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .kpi-label { font-size: 13px; color: var(--text-muted); text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em; }
    .kpi-value { font-size: 32px; font-weight: 800; color: var(--text); margin: 8px 0; }
    .kpi-change { font-size: 13px; color: var(--accent); font-weight: 600; display: flex; align-items: center; gap: 4px; }
    .chart-container { background: var(--card); border: 1px solid var(--border); padding: 24px; border-radius: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">Enterprise Sales Performance Dashboard</div>
    <div class="badge">Live Sync Active</div>
  </div>
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Quarterly Revenue</div>
      <div class="kpi-value">$154,200</div>
      <div class="kpi-change">↑ +18.4% vs last quarter</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Target Attainment</div>
      <div class="kpi-value">123.5%</div>
      <div class="kpi-change">↑ Exceeded target</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Average Deal Size</div>
      <div class="kpi-value">$14,800</div>
      <div class="kpi-change">↑ +5.2% expansion</div>
    </div>
  </div>
  <div class="chart-container">
    <canvas id="mainChart" height="120"></canvas>
  </div>
  <script>
    const ctx = document.getElementById('mainChart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6'],
        datasets: [{
          label: 'Booked Revenue ($k)',
          data: [18, 42, 68, 95, 128, 154.2],
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: { responsive: true, plugins: { legend: { position: 'top' } } }
    });
  </script>
</body>
</html>`,
            createTime: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
            sizeBytes: 3120,
            mimeType: "text/html",
          },
        ],
      },
      {
        id: "quarterly_revenue.csv",
        sessionId: "1",
        userId: "test-user",
        filename: "quarterly_revenue.csv",
        title: "Q1-Q4 Revenue Breakdown by Product & Region",
        mimeType: "text/csv",
        currentVersion: 0,
        createTime: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        updateTime: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        scope: "session",
        versions: [
          {
            version: 0,
            content: `Quarter,Region,Product_Line,Target_Revenue_USD,Actual_Revenue_USD,Growth_Pct
Q1-2026,North America,Cloud AI Agents,120000,145000,20.8
Q1-2026,EMEA,Cloud AI Agents,85000,92000,8.2
Q1-2026,APAC,Cloud AI Agents,60000,78000,30.0
Q2-2026,North America,Reasoning Engines,150000,185000,23.3
Q2-2026,EMEA,Reasoning Engines,110000,128000,16.4
Q2-2026,APAC,Reasoning Engines,80000,99000,23.8
Q3-2026,North America,Enterprise Search,90000,105000,16.7
Q3-2026,EMEA,Enterprise Search,75000,82000,9.3`,
            createTime: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
            sizeBytes: 460,
            mimeType: "text/csv",
          },
        ],
      },
      {
        id: "system_architecture.svg",
        sessionId: "1",
        userId: "test-user",
        filename: "system_architecture.svg",
        title: "Agent Platform Cloud Architecture",
        mimeType: "image/svg+xml",
        currentVersion: 0,
        createTime: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        updateTime: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        scope: "session",
        versions: [
          {
            version: 0,
            content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" width="100%" height="100%">
  <defs>
    <linearGradient id="gcpGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1a73e8"/>
      <stop offset="100%" stop-color="#4285f4"/>
    </linearGradient>
    <linearGradient id="bffGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f9d58"/>
      <stop offset="100%" stop-color="#34a853"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="#f8f9fa" rx="12"/>
  <text x="400" y="40" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="18" font-weight="bold" fill="#202124">Agent Runtime UI System Architecture</text>
  
  <rect x="60" y="100" width="200" height="220" rx="10" fill="url(#bffGrad)" opacity="0.9"/>
  <text x="160" y="130" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="16" font-weight="bold" fill="#ffffff">Next.js App Router (BFF)</text>
  <text x="160" y="165" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" fill="#e8f0fe">• Web Crypto JWT Auth</text>
  <text x="160" y="195" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" fill="#e8f0fe">• SSE Streaming Proxy</text>
  <text x="160" y="225" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" fill="#e8f0fe">• Artifacts & Sessions API</text>
  <text x="160" y="255" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" fill="#e8f0fe">• Memory & State Sync</text>

  <line x1="270" y1="210" x2="520" y2="210" stroke="#5f6368" stroke-width="3" stroke-dasharray="6,6"/>
  <polygon points="530,210 515,202 515,218" fill="#5f6368"/>
  <text x="395" y="195" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" font-weight="600" fill="#5f6368">REST / SSE :streamQuery</text>

  <rect x="540" y="100" width="200" height="220" rx="10" fill="url(#gcpGrad)" opacity="0.95"/>
  <text x="640" y="130" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="16" font-weight="bold" fill="#ffffff">Google Cloud Agent Runtime</text>
  <text x="640" y="165" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" fill="#e8f0fe">• Vertex AI Reasoning Engine</text>
  <text x="640" y="195" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" fill="#e8f0fe">• ADK Agent Orchestration</text>
  <text x="640" y="225" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" fill="#e8f0fe">• GCS Artifact Storage</text>
  <text x="640" y="255" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" fill="#e8f0fe">• Context Caching Service</text>
</svg>`,
            createTime: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
            sizeBytes: 2450,
            mimeType: "image/svg+xml",
          },
        ],
      },
      {
        id: "pipeline_analysis.py",
        sessionId: "1",
        userId: "test-user",
        filename: "pipeline_analysis.py",
        title: "Revenue Forecast & Outlier Detection Pipeline",
        mimeType: "text/x-python",
        currentVersion: 0,
        createTime: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        updateTime: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        scope: "session",
        versions: [
          {
            version: 0,
            content: `"""
Revenue Forecast & Anomaly Detection Pipeline
Powered by Vertex AI Agent Runtime & Scikit-Learn
"""

import pandas as pd
import numpy as np

def run_forecast_analysis(csv_path: str = "quarterly_revenue.csv"):
    df = pd.read_csv(csv_path)
    df["Variance_USD"] = df["Actual_Revenue_USD"] - df["Target_Revenue_USD"]
    
    top_performers = df.sort_values(by="Growth_Pct", ascending=False)
    print("=== Top Growth Product Lines ===")
    print(top_performers[["Quarter", "Region", "Product_Line", "Growth_Pct"]])
    
    total_target = df["Target_Revenue_USD"].sum()
    total_actual = df["Actual_Revenue_USD"].sum()
    overall_attainment = (total_actual / total_target) * 100
    
    print(f"\\nOverall Attainment: {overall_attainment:.2f}%")
    return {
        "total_actual": total_actual,
        "total_target": total_target,
        "overall_attainment": overall_attainment,
    }

if __name__ == "__main__":
    run_forecast_analysis()
`,
            createTime: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
            sizeBytes: 850,
            mimeType: "text/x-python",
          },
        ],
      },
    ],
  ],
]);
