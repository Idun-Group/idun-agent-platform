// Mock data for testing the new API agent structure
// This file can be used to test the frontend with sample data

// --- FAKE DATA POUR LES COMPOSANTS ---
export const agentData = {
    name: 'Customer Support Agent',
    status: 'Deployed',
    description:
        'AI agent specialized in customer support and query resolution',
};

import { Activity, CheckCircle, Clock, Zap } from 'lucide-react';

export const metricsData = [
    {
        title: 'Total Executions',
        value: '2,547',
        trend: '+12%',
        trendColor: 'green' as const,
        icon: Activity,
        iconColor: '#10b981',
    },
    {
        title: 'Success Rate',
        value: '98.5%',
        trend: '+2.1%',
        trendColor: 'green' as const,
        icon: CheckCircle,
        iconColor: '#34d399',
    },
    {
        title: 'Avg. Response Time',
        value: '1.2s',
        trend: '-15%',
        trendColor: 'red' as const,
        icon: Clock,
        iconColor: '#f59e0b',
    },
    {
        title: 'Total Cost',
        value: '$45.30',
        trend: '+8%',
        trendColor: 'blue' as const,
        icon: Zap,
        iconColor: '#6366f1',
    },
];

export const usageData = [
    { date: '2025-08-04', success: 198, errors: 2, total: 200 },
    { date: '2025-08-05', success: 234, errors: 1, total: 235 },
    { date: '2025-08-06', success: 189, errors: 0, total: 189 },
    { date: '2025-08-07', success: 267, errors: 3, total: 270 },
    { date: '2025-08-08', success: 223, errors: 2, total: 225 },
    { date: '2025-08-09', success: 245, errors: 0, total: 245 },
    { date: '2025-08-10', success: 234, errors: 1, total: 235 },
];

export const agentInfo = {
    framework: 'LANGCHAIN',
    source: {
        type: 'github' as const,
        url: 'https://github.com/my-org/customer-support-agent.git',
        name: 'customer-support-agent',
    },
    tools: ['knowledge_base_lookup', 'order_status_check'],
    lastRun: '2h ago',
    observability: ['LANGFUSE'],
};

export const activityData = [
    {
        id: 1,
        type: 'execution',
        title: 'Agent executed successfully',
        status: 'success',
        duration: '0.8s',
        timestamp: '2025-08-10 14:30',
        details: 'Execution',
    },
    {
        id: 2,
        type: 'deployment',
        title: 'New version deployed',
        status: 'success',
        duration: '2.1s',
        timestamp: '2025-08-09 10:15',
        details: 'Deployment',
    },
    {
        id: 3,
        type: 'error',
        title: 'Execution failed - timeout',
        status: 'error',
        duration: '1.5s',
        timestamp: '2025-08-08 18:45',
        details: 'Execution',
    },
    {
        id: 4,
        type: 'execution',
        title: 'Agent executed successfully',
        status: 'success',
        duration: '1.2s',
        timestamp: '2025-08-08 09:20',
        details: 'Execution',
    },
];

export const configurationData = {
    general: {
        agentToAgent: { enabled: true, label: 'Enabled' },
        streaming: { enabled: true, label: 'Enabled' },
        inputSchema: 'text',
        outputSchema: 'text',
        parameters: {
            max_retries: 3,
            language: 'en',
        },
    },
    langGraph: {
        checkpointType: 'SQLITE',
        databasePath: '/var/lib/agent-data/customer_support.db',
    },
    observability: {
        provider: 'LANGFUSE',
        configuration: {
            langfuse_api_key: 'sk-langfuse-xxxx',
            langfuse_host: 'https://cloud.langfuse.com',
        },
    },
};

export const logsData = [
    {
        id: 1,
        timestamp: '2025-08-10 14:30:15',
        level: 'INFO',
        message: 'Agent execution started',
    },
    {
        id: 2,
        timestamp: '2025-08-10 14:30:16',
        level: 'DEBUG',
        message: 'Loading configuration from memory',
    },
    {
        id: 3,
        timestamp: '2025-08-10 14:30:17',
        level: 'INFO',
        message: 'Processing user input: "How can I reset my password?"',
    },
    {
        id: 4,
        timestamp: '2025-08-10 14:30:18',
        level: 'DEBUG',
        message: 'Invoking password_reset_flow node',
    },
    {
        id: 5,
        timestamp: '2025-08-10 14:30:19',
        level: 'INFO',
        message: 'Generated response: "I can help you reset your password..."',
    },
    {
        id: 6,
        timestamp: '2025-08-10 14:30:20',
        level: 'INFO',
        message: 'Agent execution completed successfully',
    },
    {
        id: 7,
        timestamp: '2025-08-10 14:29:45',
        level: 'ERROR',
        message: 'Failed to connect to external API: Connection timeout',
    },
    {
        id: 8,
        timestamp: '2025-08-10 14:29:30',
        level: 'WARNING',
        message: 'High memory usage detected: 85% of allocated memory in use',
    },
];

export const defaultCodeContent = `# Customer Support Agent\nfrom langchain.agents import Agent\nfrom langchain.tools import Tool\nfrom langchain.memory import ConversationBufferMemory\nfrom langchain.llms import OpenAI\nimport json\n\nclass CustomerSupportAgent:\n    def __init__(self):\n        self.llm = OpenAI(temperature=0.7)\n        self.memory = ConversationBufferMemory()\n        self.knowledge_base = self.load_knowledge_base()\n        \n    def load_knowledge_base(self):\n        """Load the customer support knowledge base"""\n        try:\n            with open('knowledge_base.json', 'r') as f:\n                return json.load(f)\n        except FileNotFoundError:\n            return {}\n    \n    def process_query(self, user_query: str):\n        """Process a customer support query"""\n        # Search knowledge base first\n        relevant_info = self.search_knowledge_base(user_query)\n        \n        if relevant_info:\n            return self.generate_response_with_kb(user_query, relevant_info)\n        else:\n            return self.generate_fallback_response(user_query)\n    \n    def search_knowledge_base(self, query: str):\n        """Search for relevant information in knowledge base"""\n        # Implementation for knowledge base search\n        for item in self.knowledge_base:\n            if any(keyword in query.lower() for keyword in item.get('keywords', [])):\n                return item\n        return None\n    \n    def generate_response_with_kb(self, query: str, kb_info: dict):\n        """Generate response using knowledge base information"""\n        prompt = f"""\n        Customer Query: {query}\n        Knowledge Base Info: {kb_info.get('content', '')}\n        \n        Please provide a helpful response to the customer based on the knowledge base information.\n        """\n        return self.llm(prompt)\n    \n    def generate_fallback_response(self, query: str):\n        """Generate fallback response when no KB info is found"""\n        prompt = f"""\n        Customer Query: {query}\n        \n        I don't have specific information about this topic in my knowledge base.\n        Please provide a helpful general response and suggest the customer contact support.\n        """\n        return self.llm(prompt)\n\n# Agent configuration\nagent = CustomerSupportAgent()\n\ndef run_agent(user_input: str):\n    """Main entry point for the agent"""\n    try:\n        response = agent.process_query(user_input)\n        return {\n            "status": "success",\n            "response": response,\n            "timestamp": "2025-08-10 14:30:19"\n        }\n    except Exception as e:\n        return {\n            "status": "error",\n            "error": str(e),\n            "timestamp": "2025-08-10 14:30:19"\n        }\n`;

export const mockApiAgents = [
    {
        id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
        status: 'deployed',
        name: 'Customer Support Bot',
        description: 'An agent to handle common customer inquiries.',
        framework_type: 'LANGGRAPH',
        source: {
            type: 'github',
            path: 'https://github.com/my-org/customer-support-agent.git',
        },
        config: {
            a2a: true,
            streaming: true,
            input: {
                schema: 'text',
            },
            output: {
                schema: 'text',
            },
            param1: 'max_retries=3',
            param2: 'language=en',
        },
        langgraph_config: {
            checkpoints: {
                type: 'SQLITE',
                db_path: '/var/lib/agent-data/customer_support.db',
            },
        },
        obervability: {
            type: 'LANGFUSE',
            param1: 'langfuse_api_key=sk-langfuse-xxxx',
            param2: 'langfuse_host=https://cloud.langfuse.com',
        },
        tools: ['knowledge_base_lookup', 'order_status_check'],
    },
    {
        id: 'b2c3d4e5-f6a7-8901-2345-67890abcdef0',
        status: 'pending_deployment',
        name: 'Data Analysis Assistant',
        description: 'Assists in analyzing sales data and generating reports.',
        framework_type: 'SMOLAGENT',
        source: {
            type: 'local',
            path: './agents/data_analysis_agent',
        },
        config: {
            a2a: false,
            streaming: false,
            input: {
                schema: 'json',
            },
            output: {
                schema: 'csv',
            },
            param1: 'data_source=sales_db',
            param2: 'report_format=excel',
        },
        langgraph_config: null,
        obervability: {
            type: 'ARIZE_PHOENIX',
            param1: 'arize_space_key=arize-key-yyy',
            param2: 'arize_dataset_id=sales_analysis',
        },
        tools: ['database_query', 'chart_generation'],
    },
    {
        id: 'c3d4e5f6-a7b8-9012-3456-7890abcdef01',
        status: 'deployed',
        name: 'N8N Workflow Orchestrator',
        description: 'An agent to trigger and manage N8N workflows.',
        framework_type: 'N8N',
        source: {
            type: 'remote',
            path: 'http://n8n-instance.mycompany.com/webhook/agent_trigger',
        },
        config: {
            a2a: true,
            streaming: true,
            input: {
                schema: 'json',
            },
            output: {
                schema: 'json',
            },
            param1: 'workflow_id=123',
            param2: 'api_key=n8n-secret',
        },
        langgraph_config: null,
        obervability: {
            type: 'LANGFUSE',
            param1: 'langfuse_api_key=sk-langfuse-abc',
            param2: 'langfuse_host=https://us.langfuse.com',
        },
        tools: ['n8n_workflow_trigger', 'n8n_status_check'],
    },
    {
        id: 'd4e5f6a7-b8c9-0123-4567-890abcdef012',
        status: 'failed',
        name: 'Internal Bug Reporter',
        description: 'Automates the reporting of internal software bugs.',
        framework_type: 'ADK',
        source: {
            type: 'github',
            path: 'https://github.com/internal-tools/bug-reporter-agent.git',
        },
        config: {
            a2a: false,
            streaming: false,
            input: {
                schema: 'text',
            },
            output: {
                schema: 'text',
            },
            param1: 'jira_project=BUG',
            param2: 'default_assignee=dev_team',
        },
        langgraph_config: null,
        obervability: {
            type: 'ARIZE_PHOENIX',
            param1: 'arize_space_key=arize-key-zzz',
            param2: 'arize_dataset_id=bug_reports',
        },
        tools: ['jira_api_interface', 'slack_notifier'],
    },
    {
        id: 'e5f6a7b8-c9d0-1234-5678-90abcdef0123',
        status: 'deployed',
        name: 'Social Media Content Generator',
        description: 'Generates engaging content for social media platforms.',
        framework_type: 'LANGGRAPH',
        source: {
            type: 'local',
            path: '/opt/agents/social_media',
        },
        config: {
            a2a: true,
            streaming: true,
            input: {
                schema: 'text',
            },
            output: {
                schema: 'text',
            },
            param1: 'platform=twitter',
            param2: 'hashtags_limit=5',
        },
        langgraph_config: {
            checkpoints: {
                type: 'SQLITE',
                db_path: '/var/lib/agent-data/social_media.db',
            },
        },
        obervability: {
            type: 'LANGFUSE',
            param1: 'langfuse_api_key=sk-langfuse-def',
            param2: 'langfuse_host=https://eu.langfuse.com',
        },
        tools: ['image_generator', 'sentiment_analyzer'],
    },
    {
        id: 'f6a7b8c9-d0e1-2345-6789-0abcdef01234',
        status: 'deployed',
        name: 'Email Automation Agent',
        description: 'Automates sending personalized emails to users.',
        framework_type: 'SMOLAGENT',
        source: {
            type: 'github',
            path: 'https://github.com/email-service/email-agent.git',
        },
        config: {
            a2a: false,
            streaming: false,
            input: {
                schema: 'json',
            },
            output: {
                schema: 'boolean',
            },
            param1: 'template_id=welcome_email',
            param2: 'smtp_server=mail.mycompany.com',
        },
        langgraph_config: null,
        obervability: {
            type: 'ARIZE_PHOENIX',
            param1: 'arize_space_key=arize-key-qqq',
            param2: 'arize_dataset_id=email_campaigns',
        },
        tools: ['email_sender', 'crm_lookup'],
    },
    {
        id: 'a7b8c9d0-e1f2-3456-7890-abcdef012345',
        status: 'error',
        name: 'Financial Report Generator',
        description:
            'Generates monthly financial reports from accounting data.',
        framework_type: 'ADK',
        source: {
            type: 'remote',
            path: 'http://192.168.1.100/financial_agent_api',
        },
        config: {
            a2a: false,
            streaming: false,
            input: {
                schema: 'date_range',
            },
            output: {
                schema: 'pdf',
            },
            param1: 'accounting_system=sap',
            param2: 'currency=USD',
        },
        langgraph_config: null,
        obervability: {
            type: 'LANGFUSE',
            param1: 'langfuse_api_key=sk-langfuse-ghi',
            param2: 'langfuse_host=https://cloud.langfuse.com',
        },
        tools: ['sap_connector', 'pdf_generator'],
    },
    {
        id: 'b8c9d0e1-f2a3-4567-8901-abcdef012345',
        status: 'deployed',
        name: 'HR Onboarding Assistant',
        description: 'Guides new employees through the onboarding process.',
        framework_type: 'LANGGRAPH',
        source: {
            type: 'local',
            path: './agents/hr_onboarding',
        },
        config: {
            a2a: true,
            streaming: true,
            input: {
                schema: 'employee_details',
            },
            output: {
                schema: 'checklist',
            },
            param1: 'welcome_pack_url=http://intranet/welcome',
            param2: 'slack_channel=onboarding_new_hires',
        },
        langgraph_config: {
            checkpoints: {
                type: 'SQLITE',
                db_path: '/var/lib/agent-data/hr_onboarding.db',
            },
        },
        obervability: {
            type: 'ARIZE_PHOENIX',
            param1: 'arize_space_key=arize-key-lll',
            param2: 'arize_dataset_id=hr_onboarding_flow',
        },
        tools: ['document_signer', 'calendar_scheduler'],
    },
    {
        id: 'c9d0e1f2-a3b4-5678-9012-abcdef012345',
        status: 'disabled',
        name: 'Website Content Scraper',
        description: 'Extracts specific content from designated websites.',
        framework_type: 'N8N',
        source: {
            type: 'remote',
            path: 'http://n8n-instance.mycompany.com/webhook/scraper_trigger',
        },
        config: {
            a2a: false,
            streaming: false,
            input: {
                schema: 'url_list',
            },
            output: {
                schema: 'json',
            },
            param1: 'selector=div.article-body',
            param2: 'frequency=daily',
        },
        langgraph_config: null,
        obervability: {
            type: 'LANGFUSE',
            param1: 'langfuse_api_key=sk-langfuse-jkl',
            param2: 'langfuse_host=https://eu.langfuse.com',
        },
        tools: ['web_scraper_tool', 'data_cleaner'],
    },
    {
        id: 'd0e1f2a3-b4c5-6789-0123-abcdef012345',
        status: 'deployed',
        name: 'Code Review Assistant',
        description: 'Provides initial feedback on code pull requests.',
        framework_type: 'SMOLAGENT',
        source: {
            type: 'github',
            path: 'https://github.com/dev-tools/code-review-agent.git',
        },
        config: {
            a2a: true,
            streaming: true,
            input: {
                schema: 'pull_request_url',
            },
            output: {
                schema: 'code_review_comments',
            },
            param1: 'language=python',
            param2: 'severity_threshold=medium',
        },
        langgraph_config: null,
        obervability: {
            type: 'ARIZE_PHOENIX',
            param1: 'arize_space_key=arize-key-mmm',
            param2: 'arize_dataset_id=code_reviews',
        },
        tools: ['code_analyzer', 'git_diff_parser'],
    },
];

// Helper function to get a random subset of mock agents
export const getMockAgents = (count: number = 5) => {
    const shuffled = [...mockApiAgents].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
};

// Helper function to get a single mock agent by status
export const getMockAgentByStatus = (status: string) => {
    return mockApiAgents.find((agent) => agent.status === status);
};
