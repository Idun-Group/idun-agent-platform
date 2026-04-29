/**
 * Hard-coded step sequence for the guided product tour.
 *
 * Copy is lifted verbatim from the original onboarding UX spec
 * (docs/superpowers/specs/2026-04-27-idun-onboarding-ux-design.md
 * §"Guided product tour"). The original spec's "Local traces" step is
 * omitted because /traces is currently a 404 route in the standalone
 * (traces backend deferred — see services/idun_agent_standalone_ui/
 * CLAUDE.md "Half-migration state").
 *
 * Step 4 (Deployment) renders as a centered modal because there is no
 * /admin/deployment route. The popover footer carries an outbound link
 * to the deployment docs.
 */

export type TourStep = {
  /**
   * Route to navigate to before showing this step. Undefined = stay on
   * current route. Steps with `route` defined trigger a router.push() if
   * the current pathname differs.
   */
  route?: string;

  /**
   * CSS selector for the element to anchor the popover on. Undefined =
   * Driver.js renders the popover as a centered modal (used for step 4:
   * Deployment).
   */
  element?: string;

  popover: {
    title: string;
    description: string;
  };
};

export const TOUR_STEPS: readonly TourStep[] = [
  {
    route: "/",
    element: '[data-tour="chat-composer"]',
    popover: {
      title: "Chat",
      description:
        "This is where you test your agent. Send a message to confirm it is running through Idun.",
    },
  },
  {
    route: "/admin/agent",
    element: '[data-tour="sidebar-agent-config"]',
    popover: {
      title: "Admin config",
      description:
        "Admin lets you inspect and manage the active config for this standalone agent.",
    },
  },
  {
    route: "/admin/agent",
    element: '[data-tour="sidebar-agent-group"]',
    popover: {
      title: "Prompts, tools, and guardrails",
      description:
        "When you are ready, add prompts, tools, and guardrails to make the agent safer and more useful.",
    },
  },
  {
    route: "/admin/agent",
    element: '[data-tour="sidebar-observability"]',
    popover: {
      title: "Observability",
      description:
        "Later, connect observability providers to follow your agent beyond local traces.",
    },
  },
  {
    popover: {
      title: "Deployment",
      description:
        "This same standalone agent can be packaged for Docker or Cloud Run when you are ready to deploy.",
    },
  },
] as const;

/**
 * Outbound link target for step 4's popover footer. Pulled out as its own
 * export so the TourProvider can render the link consistently and tests
 * can assert against it without string duplication.
 */
export const DEPLOYMENT_DOCS_URL =
  "https://docs.idunplatform.com/deployment/overview";
