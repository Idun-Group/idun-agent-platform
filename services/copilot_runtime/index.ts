import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNodeHttpEndpoint,
} from "@copilotkit/runtime";
import { HttpAgent } from "@ag-ui/client";
import * as http from 'http';
import { parse } from 'url';

const PORT = process.env.PORT || 8001;
const DEFAULT_MANAGER_URL = process.env.MANAGER_URL || 'http://manager:8000';

// Intercept and transform requests to the agent to ensure the correct payload structure
const originalFetch = global.fetch;
global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = input.toString();

    // Only intercept POST requests to the agent stream endpoint
    if (urlStr.includes('/agent/copilotkit/stream') && init && init.method === 'POST') {
        console.log(`[Proxy] Intercepting agent request to: ${urlStr}`);
        try {
            if (init.body) {
                const bodyStr = init.body.toString();
                const originalBody = JSON.parse(bodyStr);

                console.log("[Proxy] Raw Copilot Payload:", JSON.stringify(originalBody, null, 2));

                // Transform/Ensure the payload matches the exact structure required by the agent
                const transformedBody = {
                    threadId: originalBody.threadId || "thread-02", // Use incoming or default
                    runId: originalBody.runId || "run-02",
                    state: originalBody.state || {},
                    messages: originalBody.messages || [],
                    tools: originalBody.tools || [],
                    context: originalBody.context || [],
                    forwardedProps: originalBody.forwardedProps || {}
                };

                console.log("[Proxy] Transformed Payload (Sending to Agent):", JSON.stringify(transformedBody, null, 2));

                // Update the body with the transformed JSON
                init.body = JSON.stringify(transformedBody);
            }
        } catch (e) {
            console.error("[Proxy] Error transforming payload:", e);
        }
    }

    // Generate and log CURL command for debugging
    if (urlStr.includes('/agent/copilotkit/stream')) {
        try {
            let curlCmd = `curl -v -X ${init?.method || 'GET'} '${urlStr}'`;

            // Handle headers
            if (init?.headers) {
                let headers: Record<string, string> = {};
                if (init.headers instanceof Headers) {
                    init.headers.forEach((v, k) => headers[k] = v);
                } else if (Array.isArray(init.headers)) {
                    init.headers.forEach(([k, v]) => headers[k] = v);
                } else {
                    headers = init.headers as Record<string, string>;
                }

                Object.entries(headers).forEach(([key, value]) => {
                    curlCmd += ` \\\n  -H '${key}: ${value}'`;
                });
            }

            // Handle body
            if (init?.body) {
                 const bodyEscaped = init.body.toString().replace(/'/g, "'\\''");
                 curlCmd += ` \\\n  -d '${bodyEscaped}'`;
            }
            console.log("\n[Proxy] ----------------------------------------------------------------");
            console.log("[Proxy] Equivalent CURL command:");
            console.log(curlCmd);
            console.log("[Proxy] ----------------------------------------------------------------\n");
        } catch (e) {
            console.error("[Proxy] Error generating curl command:", e);
        }
    }

    try {
        const response = await originalFetch(input, init);
        if (urlStr.includes('/agent/copilotkit/stream')) {
             console.log(`[Proxy] Agent response status: ${response.status} ${response.statusText}`);
             if (!response.ok) {
                 const text = await response.clone().text();
                 console.error(`[Proxy] Agent error response body: ${text}`);
             }
        }
        return response;
    } catch (err) {
        if (urlStr.includes('/agent/copilotkit/stream')) {
            console.error(`[Proxy] Network error contacting agent at ${urlStr}:`, err);
        }
        throw err;
    }
};

const serviceAdapter = new ExperimentalEmptyAdapter();

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Extract agent URL from request query params
  const parsedUrl = parse(req.url || '', true);
  const agentUrl = parsedUrl.query.agentUrl as string;
  const targetAgentUrl = agentUrl || `${DEFAULT_MANAGER_URL}/agent/copilotkit/stream`;

  console.log(`[Proxy] Handling Copilot request for agent: ${targetAgentUrl}`);

  const runtime = new CopilotRuntime({
    agents: {
      my_agent: new HttpAgent({
        url: targetAgentUrl,
      }),
    },
  });

  const handler = copilotRuntimeNodeHttpEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/copilotkit",
  });

  return handler(req, res);
});

server.listen(PORT, () => {
  console.log(`Copilot Runtime running on port ${PORT}`);
});
