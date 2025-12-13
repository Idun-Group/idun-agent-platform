# Guardrails

## Overview
Guardrails are an essential components before releasing an agent to users.

Guardrails à crucial when an agent is exposed to users. It allow to scan the input and output of an agent, ensuring they operate within defined boundaries.
The Idun Agent Platform's guardrails implementation uses [Guardrails AI](https://guardrailsai.com) under the hood to provide production-ready safety mechanisms for your agents.

### List of guardrails:

- **Ban List**: Prevents the model from generating or accepting specific forbidden words or phrases.
- **Bias Check**: Prevents the model from generating or accepting specific forbidden words or phrases.
- **Detect PII**: Ensures that any given text does not contain PII.
- **Correct Language**: Verifies that the input or output is written in the expected language.
- **Competition Check**: Prevents the model from generating or accepting specific forbidden words or phrases.
- **Gibberish Text**: Filters out nonsensical, incoherent, or repetitive output.
- **NSFW Text**: Blocks content that is sexually explicit, violent, or unsafe.
- **Detect Jailbreak**: Identifies attempts to manipulate the model into bypassing safety guidelines.
- **Restrict Topic**: Keeps the conversation strictly within a defined subject area.
- **Prompt Injection**: Detects prompt injection attempts.
- **RAG Hallucination**: Detects hallucinations in RAG outputs.
- **Toxic Language**: Detects toxic language.
- **Code Scanner**: Scan code for allowed languages.
- **Model Armor**: Google Cloud Model Armor
- **Custom LLM**: Define custom LLM guardrails.

!!! warning "Work in Progress"
    Output guardrails are currently a work in progress. Only input guardrails are fully supported at this time.

## Setting Up Guardrails

You can configure guardrails when creating or editing an agent in the Manager UI.

### Step 1: Navigate to Guardrails Configuration

During agent creation:

1. Navigate to the **Guardrails** step in the agent creation wizard
2. Select the guardrail type you want to add

### Step 2: Configure Guardrails

Currently supported guardrail types:

!!! example "Ban List"
    Blocks specific keywords or phrases from agent inputs and outputs. Useful for filtering profanity, competitor names, or sensitive topics that shouldn't appear in agent conversations.

    **Setup:**

    1. Select **Ban List** from the guardrail type dropdown
    2. Enter **3 words** or phrases to block
    3. Click **Add** or **Next**

!!! example "PII Detector"
    Detects and handles personally identifiable information (PII) in agent conversations. Automatically identifies sensitive data like emails, phone numbers, or addresses to maintain privacy and meet compliance requirements like GDPR or HIPAA.

    **Setup:**

    1. Select **PII Detector** from the guardrail type dropdown
    2. Select **PII types** to detect from the checkboxes (e.g., email, phone, address)
    3. Click **Add** or **Next**

![PII Email Detector Setup](../images/guardrail_email_detector.png)

!!! warning "API Key Required"
    Guardrails functionality requires the `GUARDRAILS_API_KEY` environment variable to be configured on your system. This key authenticates your integration with Guardrails AI services. Contact your platform administrator if guardrails options are not available in the UI.

### Step 3: Test Your Guardrails

After configuration, test your guardrails before production:

1. Complete agent setup and start it in a test environment
2. Send inputs that should trigger guardrails (banned words, PII)
3. Verify legitimate content passes through without false positives
4. Refine rules based on test results

---

## Best Practices

!!! tip "Effective Guardrail Usage"
    - **Layer multiple guardrails** for comprehensive protection - combine Ban Lists with PII detection
    - **Test thoroughly** before production with edge cases and real user scenarios
    - **Monitor regularly** to track trigger rates and identify false positives
    - **Update as needed** - treat guardrails as a living system that evolves with your use case
    - **Balance security and UX** - avoid overly restrictive rules that frustrate legitimate users

## Troubleshooting

!!! question "Guardrails not working?"
    1. **Check API key**: Verify `GUARDRAILS_API_KEY` is set correctly
    2. **Review configuration**: Ensure guardrail settings are saved and active
    3. **Check logs**: Look for guardrail-related errors in agent runtime logs
    4. **Test patterns**: Verify your test input actually matches the guardrail rules

!!! question "False positives?"
    - Make ban list rules more specific
    - Create exception lists for known safe patterns
    - Adjust PII detector sensitivity
    - Review user reports and refine rules regularly

## Next Steps

- [Add MCP servers](../mcp/configuration.md) to extend agent capabilities
- [Deploy your agent](../deployment/concepts.md) to production
- [Learn about CLI](../guides/cli-setup.md) for advanced workflows
