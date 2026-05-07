# Idun Onboarding UX Design

Date: 2026-04-27

Status: Product and UX decisions locked through brainstorming. This document intentionally avoids technical implementation details.

Scope:

- Define the first-run onboarding experience for developers discovering Idun from GitHub or documentation.
- Cover the main folder states a developer may start from.
- Clarify what the wizard should communicate, ask, and avoid.
- Provide a reviewable UX contract before implementation planning begins.

## Executive summary

The onboarding promise is:

> Run `idun init` anywhere. Idun understands what kind of repo you are in and guides you to a runnable standalone agent.

The first-run goal is not to explain every Idun capability. The goal is to help a developer reach the first useful moment:

> My agent runs locally with a chat UI, admin UI, and traces.

The broader product promise is introduced after that:

> Idun helps productionize LangGraph and ADK agents with config, traces, guardrails, observability, tools, deployment readiness, and later Governance Hub enrollment.

## Locked principles

### Wizard-first experience

`idun init` starts a guided onboarding wizard.

The wizard should:

- welcome the user
- scan the current folder as part of the guided experience
- explain what it found
- ask the user what they want to do next
- write nothing without confirmation
- lead to a successful local run

The default posture is:

> Wizard-first UX, scanner-first inside the wizard, no silent writes.

### Main command family

The main OSS onboarding commands are:

```text
idun init
idun serve
```

Product meaning:

- `idun init` prepares the current folder for Idun.
- `idun serve` runs the selected standalone agent locally.

The first-run experience should not lead with `idun-standalone`. That name may remain available for compatibility, but the product onboarding should center on `idun`.

### One standalone agent

Standalone onboarding always produces or selects one deployable agent.

If multiple supported agents are detected, the user chooses one.

The wizard must not create:

- a local fleet
- a workspace
- a multi-agent dashboard
- a reusable local catalog
- one config that manages multiple agents

Core rule:

> One selected agent becomes one standalone Idun runtime.

### Supported detection scope

The wizard only detects:

- LangGraph agents
- Google ADK agents

It does not auto-detect other agent frameworks during first-run onboarding.

If the folder contains other Python code or another agent framework, the wizard should treat it as:

> Code found, but no supported Idun agent detected.

This keeps the product message clear:

> Idun helps you run and productionize LangGraph and ADK agents.

### First-run focus

The first-run path focuses on:

- selecting or creating one agent
- making the user aware of LLM readiness
- running locally
- opening chat first
- showing local traces
- introducing admin capabilities through a guided tour

The first-run path should not ask the user to configure every production capability.

Do not include first-run setup for:

- external observability providers
- Governance Hub
- enterprise enrollment
- RBAC
- workspaces
- fleet management
- deployment choices as required steps

These can appear later as next steps or guided product discovery.

## First-run product promise

The first visible promise should be simple:

> Run your agent locally with chat, admin UI, and traces.

The expanded promise should appear once the user understands the immediate value:

> Then productionize it with config, traces, guardrails, observability, tools, and deployment readiness.

Suggested welcome tone:

> Let’s connect your agent to Idun.

If an existing supported agent is found:

> We found your LangGraph/ADK agent. Idun can wrap it with a local chat UI, admin panel, traces, and production-ready config.

If no agent is found:

> No supported agent found yet. Let’s help you create or connect one.

## Folder states

### State 1: Empty folder

User situation:

> A developer wants to try Idun from scratch.

Wizard goal:

> Help the user create their first Idun agent.

Primary message:

> No agent found yet. Let’s create your first Idun agent.

The wizard should ask:

> What kind of agent do you want to create?

Options:

- LangGraph
- Google ADK

LangGraph should be the recommended/default option because it is the strongest current path for the Idun first-run experience.

ADK should be presented as a first-class option for users already in the Google agent ecosystem.

The wizard should not present Haystack in the main first-run path.

Desired outcome:

- user chooses LangGraph or ADK
- Idun prepares a runnable starter
- user is warned about LLM readiness if the starter needs model credentials
- user confirms before any files are written
- wizard offers to start Idun locally

UX principle:

> This should feel like creating the first real Idun agent, not generating a disposable toy.

### State 2: Folder with one supported agent

User situation:

> A developer already has one LangGraph or ADK agent and wants to try Idun with it.

Wizard goal:

> Help the user run that existing agent locally through Idun.

Primary message:

> We found one supported agent.

The wizard should show:

- framework detected: LangGraph or ADK
- likely agent name
- where the agent appears to live
- whether Idun is confident enough to continue

The wizard should ask for confirmation before preparing Idun:

> Use this agent with Idun?

The wizard should infer agent name and description. It should not ask the user to manually name the agent during first-run onboarding.

The admin tour can later show where the name and description can be edited.

Desired outcome:

- user confirms the detected agent
- Idun prepares local standalone setup for that agent
- wizard asks optional LLM provider metadata
- wizard warns about LLM readiness
- wizard offers to start Idun locally

### State 3: Folder with multiple supported agents

User situation:

> A developer has a repo with more than one LangGraph or ADK agent.

Wizard goal:

> Help the user choose exactly one agent to run as this standalone Idun agent.

Primary message:

> We found multiple supported agents. Choose the one you want to run with Idun.

The wizard should list candidates in a way the user can understand:

- framework
- likely agent name
- source location
- confidence level, if useful

The wizard should not imply that standalone will manage all detected agents.

Desired outcome:

- user selects one agent
- Idun prepares one standalone setup for that selected agent
- wizard optionally explains that another agent can be configured later through another setup flow

Suggested clarification:

> Standalone runs one selected agent. You can run this wizard again later if you want to prepare another agent.

### State 4: Folder with code but no supported agent

User situation:

> A developer has code in the folder, but no detectable LangGraph or ADK agent.

Wizard goal:

> Explain what happened and offer useful next steps without pretending Idun can infer the app.

Primary message:

> I found code, but not a LangGraph or ADK agent that Idun can run yet.

The wizard should offer:

1. Create a new LangGraph or ADK agent in this repo.
2. Show guidance for adapting existing code into a supported agent.

For MVP, the wizard should not automatically convert arbitrary code into an agent.

UX principle:

> Be helpful and honest. Avoid false magic.

### State 5: Folder already configured for Idun

User situation:

> A developer runs `idun init` in a folder that already has Idun setup.

Wizard goal:

> Help the user continue, review, or re-run setup without confusion.

Primary message:

> This folder already appears to be configured for Idun.

Primary action:

> Start Idun now.

Secondary actions:

- Review current setup
- Re-run setup

This state is about detecting Idun setup, not detecting additional agent frameworks. The supported agent discovery rule remains LangGraph/ADK only.

## LLM readiness

### Core problem

Most useful agents need a connected LLM or model provider to respond.

If the user reaches the chat interface without model credentials, the first aha moment may become an error.

### Locked UX rule

Idun should make LLM readiness visible before first run, but it should not block the user from continuing.

Decision:

> Warn + continue.

Reason:

- Idun cannot know every custom model setup.
- Some agents may use local models.
- Some agents may use provider-specific or custom environment variables.
- Some users may intentionally want to start the server before setting credentials.

The wizard should not automatically wire provider credentials.

It should:

- explain that most agents require model credentials
- ask for optional provider metadata
- show provider-specific setup hints when possible
- allow the user to skip
- allow the user to continue even if readiness is uncertain

### Existing agents

For existing detected agents, ask:

> Which model provider does this agent use? This helps Idun show better setup hints. You can skip this.

Options:

- OpenAI
- Anthropic
- Google Gemini
- Vertex AI
- Azure OpenAI
- Local model / Ollama
- Other
- Skip

If the user chooses a provider, show provider-specific readiness hints.

If the user skips, show a generic warning.

Suggested generic copy:

> Most agents need model credentials to respond. I can’t verify your full LLM setup from here. If your agent uses OpenAI, Anthropic, Gemini, Vertex AI, Azure OpenAI, a local model, or another provider, make sure the required environment variables or local services are ready before sending your first message.

### New starter agents

For an empty folder, after the user chooses LangGraph or ADK, the wizard should make the model dependency clear.

Suggested copy:

> This starter may require model credentials before it can answer. You can continue now, but your first message may fail until your provider is configured.

If the starter is intentionally no-key, this should be stated clearly:

> This starter works without an LLM so you can test Idun first. You can replace it with a real LLM-backed agent later.

## Successful finish

After onboarding completes, the wizard should end with:

> Your agent is ready to run with Idun.

Then ask:

> Start Idun now?

Options:

- Yes, start now
- No, show me the command

If the user chooses yes:

- Idun starts locally
- the browser opens directly to the chat interface
- the guided product tour begins after the app is ready

If the user chooses no:

- show the user the next command
- explain what will happen when they run it

Suggested command reminder:

```text
idun serve
```

## First app experience

After a successful local start, the first destination should be chat.

The user should not land first in admin, traces, settings, or documentation.

Rationale:

> The fastest aha moment is seeing the selected agent respond.

## Guided product tour

After the local server starts successfully and the chat interface opens, the product should launch an in-app guided tour.

The tour should orient the user without interrupting the first chat too much.

Recommended tour sequence:

1. Chat
2. Local traces
3. Admin config
4. Prompts, tools, and guardrails
5. Observability
6. Deployment

### Tour step 1: Chat

Message:

> This is where you test your agent. Send a message to confirm it is running through Idun.

Goal:

- focus the user on the immediate aha moment
- reinforce that Idun wraps their selected agent

### Tour step 2: Local traces

Message:

> Every message creates a local trace so you can debug what happened.

Goal:

- show immediate operational value
- keep first run focused on local traces only

### Tour step 3: Admin config

Message:

> Admin lets you inspect and manage the active config for this standalone agent.

Goal:

- introduce the local control plane
- show where agent name/description can be edited later

### Tour step 4: Prompts, tools, and guardrails

Message:

> When you are ready, add prompts, tools, and guardrails to make the agent safer and more useful.

Goal:

- reveal productionization capabilities without making them onboarding blockers

### Tour step 5: Observability

Message:

> Later, connect observability providers to follow your agent beyond local traces.

Goal:

- show what is possible
- avoid asking for observability setup during first onboarding

### Tour step 6: Deployment

Message:

> This same standalone agent can be packaged for Docker or Cloud Run when you are ready to deploy.

Goal:

- connect local success to deployment readiness
- make deployment the next milestone, not a first-run requirement

## Local traces first

First onboarding should focus only on local traces.

Do not ask the user to configure:

- Langfuse
- Phoenix
- OpenTelemetry
- cloud tracing
- other observability providers

Those are introduced after local success through the guided tour and admin UI.

Rationale:

> The first run should prove Idun works locally before asking for external services or secrets.

## Deployment readiness

Deployment should not be a required onboarding step.

It should appear as:

- a checklist item after local success
- a guided tour step
- a documentation link
- an admin or CLI next step later

First-run onboarding should not ask:

> Do you plan to deploy this?

Rationale:

> Local success comes first. Deployment is the next milestone.

## Governance Hub timing

Governance Hub should be introduced later, not during first onboarding.

First-run onboarding should not mention:

- enterprise
- SaaS
- fleet
- workspace
- RBAC
- multi-agent governance
- enrollment

Later, after local success, the product can introduce:

> When you operate multiple deployed agents, enroll them into Governance Hub for centralized governance.

This should be a secondary concept, not a first-run requirement.

## Completion checklist

After setup, the wizard or first-run screen should show a lightweight checklist:

```text
Next steps
[ ] Send your first chat message
[ ] Open local traces after a run
[ ] Review config in Admin
[ ] Add prompts, tools, or guardrails when ready
[ ] Connect observability later
[ ] Deploy to Docker or Cloud Run
```

The checklist should reinforce the product journey:

1. Run locally.
2. Confirm the agent responds.
3. Debug locally.
4. Configure production controls.
5. Deploy.
6. Govern later if needed.

## UX copy reference

### Welcome

> Let’s connect your agent to Idun.

### Empty folder

> No supported agent found yet. Let’s create your first Idun agent.

### One supported agent

> We found one supported agent. Use this agent with Idun?

### Multiple supported agents

> We found multiple supported agents. Choose the one you want to run with Idun.

### Code but no supported agent

> I found code, but not a LangGraph or ADK agent that Idun can run yet.

### Existing Idun setup

> This folder already appears to be configured for Idun. Start it now?

### LLM readiness

> Most agents need model credentials to respond. Idun won’t modify your provider setup, but make sure your environment is ready before sending your first message.

### Finish

> Your agent is ready to run with Idun.

### First-run tour intro

> Your agent is running. Let’s take a quick look around.

## Explicit non-goals

This onboarding design does not include:

- technical implementation details
- automatic provider credential wiring
- automatic conversion of arbitrary code into agents
- detection of frameworks beyond LangGraph and ADK
- multi-agent local management
- Governance Hub enrollment
- enterprise setup
- observability provider setup during first run
- deployment setup during first run
- forcing agent name/description entry during first run

## Locked decisions summary

- `idun init` is the first-run command.
- `idun serve` is the run command.
- Onboarding is wizard-first.
- The wizard scans inside the guided flow.
- The wizard writes nothing without confirmation.
- Auto-discovery only detects LangGraph and ADK agents.
- Empty folder asks whether to create a LangGraph or ADK starter.
- Existing one-agent folders confirm the detected agent.
- Multiple-agent folders require the user to select one.
- Standalone creates one selected standalone config, not many.
- Code without a supported agent gets helpful explanation and next steps.
- Existing Idun setup offers start/review/re-run setup.
- Agent name/description are inferred and editable later.
- LLM provider is optional metadata for existing agents.
- LLM readiness warns but does not block.
- Observability setup is not part of first-run onboarding.
- Local traces are part of the first-run value.
- After successful start, open chat first.
- A guided in-product tour introduces chat, traces, admin, production controls, observability, and deployment.
- Governance Hub is introduced later, after local success.
