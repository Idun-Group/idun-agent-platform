import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import * as React from "react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TraceDetailClient from "@/app/admin/traces/[traceId]/TraceDetailClient";
import * as tracesApi from "@/lib/api/traces";

/**
 * Regression coverage for the "click-a-trace, see no detail" bug that
 * shipped before the SPA-rewrite landed.
 *
 * Production cause: under Next.js 15 ``output: "export"`` with
 * ``dynamicParams: false`` and one materialised placeholder
 * (``__trace__``), ``useParams()`` returns the build-time placeholder
 * for every dynamic URL hit at runtime. The real trace id only lives
 * on ``window.location.pathname``. ``readTraceIdFromLocation`` is the
 * fix; this file pins its behaviour against drift.
 *
 * The function itself is module-private — it is exercised through the
 * component (``TraceDetailClient``) by:
 *
 *   1. configuring ``useParams`` to return the placeholder (the real
 *      runtime shape under static export), and
 *   2. setting ``window.location.pathname`` to the deep link the user
 *      lands on.
 *
 * Each test asserts what id ``getTrace`` is invoked with — that is the
 * single observable that decides whether the user sees their real
 * trace or a "not found" placeholder.
 */

const REAL_TRACE_ID = "af40350883b4efb68e23423a6691f09f";
const PLACEHOLDER = "__trace__";

const mockUseParams = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => mockUseParams(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function withQuery(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function setPath(path: string): void {
  window.history.replaceState({}, "", path);
}

describe("readTraceIdFromLocation (via TraceDetailClient)", () => {
  // Untyped to sidestep vitest's MockInstance generic constraint —
  // ``vi.spyOn`` on an ``import * as`` namespace narrows differently
  // when assigned to a pre-declared variable than when used inline.
  // The runtime shape is what each test asserts on.
  let getTraceSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Never-resolves so the component stays in its loading state long
    // enough for us to read the fetch argument without rendering the
    // full success tree.
    getTraceSpy = vi
      .spyOn(tracesApi, "getTrace")
      .mockImplementation(() => new Promise(() => {})) as unknown as ReturnType<
      typeof vi.fn
    >;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setPath("/");
  });

  it("uses the real id from the URL when useParams returns the build-time placeholder", async () => {
    // The production bug: useParams returns "__trace__" (the static-
    // export placeholder), and without the URL parser the component
    // would fetch with that literal — the backend then 404s and the
    // user sees "Trace not found" on every deep link.
    mockUseParams.mockReturnValue({ traceId: PLACEHOLDER });
    setPath(`/admin/traces/${REAL_TRACE_ID}`);

    render(withQuery(<TraceDetailClient />));

    await waitFor(() => {
      expect(getTraceSpy).toHaveBeenCalled();
    });
    expect(getTraceSpy).toHaveBeenCalledWith(REAL_TRACE_ID);
  });

  it("handles the trailing-slash variant of the deep link identically", async () => {
    // FastAPI's ``redirect_slashes=True`` covers /admin/traces/<id>/
    // → /admin/traces/<id>, but the in-app router can also land users
    // on the trailing-slash form directly. Both must resolve to the
    // same id.
    mockUseParams.mockReturnValue({ traceId: PLACEHOLDER });
    setPath(`/admin/traces/${REAL_TRACE_ID}/`);

    render(withQuery(<TraceDetailClient />));

    await waitFor(() => {
      expect(getTraceSpy).toHaveBeenCalled();
    });
    expect(getTraceSpy).toHaveBeenCalledWith(REAL_TRACE_ID);
  });

  it("returns null when the URL is the placeholder shell itself (and falls back to params)", async () => {
    // If the user somehow lands on the literal placeholder URL (e.g.
    // a stale cached path), the parser must return null — never
    // surface ``__trace__`` to the API. With the param ALSO holding
    // the placeholder, traceId stays empty and getTrace must not be
    // called at all (the query is gated on ``enabled: !!traceId``).
    mockUseParams.mockReturnValue({ traceId: PLACEHOLDER });
    setPath(`/admin/traces/${PLACEHOLDER}/`);

    render(withQuery(<TraceDetailClient />));

    // Give React a microtask to flush the initial render + effects.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getTraceSpy).not.toHaveBeenCalled();
  });

  it("falls back to useParams when the URL has no third segment", async () => {
    // /admin/traces (the list view) should never mount this component
    // in production, but if the host route somehow renders it, the
    // parser must not pick up a phantom id from segments[2]. Falls
    // back to the params object — and because the param itself is the
    // placeholder, traceId stays empty so no fetch fires.
    mockUseParams.mockReturnValue({ traceId: PLACEHOLDER });
    setPath("/admin/traces");

    render(withQuery(<TraceDetailClient />));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getTraceSpy).not.toHaveBeenCalled();
  });

  it("falls back to useParams when the path prefix is not /admin/traces/", async () => {
    // Defence-in-depth: ensure the parser only matches its own route
    // shape, not any 3-segment path. A wrong-prefix URL plus a real
    // param id should still fetch the real id (param fallback path).
    mockUseParams.mockReturnValue({ traceId: REAL_TRACE_ID });
    setPath("/some/other/path");

    render(withQuery(<TraceDetailClient />));

    await waitFor(() => {
      expect(getTraceSpy).toHaveBeenCalled();
    });
    expect(getTraceSpy).toHaveBeenCalledWith(REAL_TRACE_ID);
  });

  it("uses the real id from useParams when useParams holds it (in-app navigation case)", async () => {
    // Once the standalone backend's SPA-rewrite + Next.js client
    // router converge, in-app navigation via ``router.push`` can
    // surface the real id on ``params`` before ``window.location``
    // settles. The component must accept that id rather than wait
    // for the URL to update — the param IS the source of truth in
    // that path.
    mockUseParams.mockReturnValue({ traceId: REAL_TRACE_ID });
    setPath(`/admin/traces/${REAL_TRACE_ID}`);

    render(withQuery(<TraceDetailClient />));

    await waitFor(() => {
      expect(getTraceSpy).toHaveBeenCalled();
    });
    expect(getTraceSpy).toHaveBeenCalledWith(REAL_TRACE_ID);
  });

  it("the URL parser wins when params and URL disagree (URL is the canonical id)", async () => {
    // Pathological case: stale params object holds the placeholder
    // but the URL has the real id. The URL must win — that is the
    // entire point of ``readTraceIdFromLocation``. Without this, a
    // hot reload that left a stale ``__trace__`` in the params object
    // would silently fetch the wrong id and 404 the user.
    mockUseParams.mockReturnValue({ traceId: PLACEHOLDER });
    setPath(`/admin/traces/${REAL_TRACE_ID}`);

    render(withQuery(<TraceDetailClient />));

    await waitFor(() => {
      expect(getTraceSpy).toHaveBeenCalled();
    });
    expect(getTraceSpy).toHaveBeenCalledWith(REAL_TRACE_ID);
    expect(getTraceSpy).not.toHaveBeenCalledWith(PLACEHOLDER);
  });
});
