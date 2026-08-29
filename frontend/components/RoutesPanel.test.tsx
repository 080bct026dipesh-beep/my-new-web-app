import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RoutesPanel from "./RoutesPanel";
import { RouteStopEntry, RouteSummary } from "@/types/route";

function makeRoute(overrides: Partial<RouteSummary> = {}): RouteSummary {
  return {
    route_id: "R0001",
    route_name: "Ratna Park - Koteshwor",
    short_name: "R1",
    vehicle_type: "microbus",
    start_stop_id: "S0001",
    end_stop_id: "S0002",
    total_stops: 12,
    approx_distance_km: 8.2,
    osrm_distance_km: null,
    status: "active",
    operator: null,
    ...overrides,
  };
}

function baseProps(overrides: Partial<React.ComponentProps<typeof RoutesPanel>> = {}) {
  return {
    routes: [makeRoute()],
    routesLoading: false,
    total: 1,
    searchQuery: "",
    onSearchChange: vi.fn(),
    visibleRouteId: null,
    visibleRouteStops: [] as RouteStopEntry[],
    visibleRouteStopsLoading: false,
    onToggleVisible: vi.fn(),
    hasMore: false,
    onLoadMore: vi.fn(),
    loadingMore: false,
    ...overrides,
  };
}

describe("RoutesPanel", () => {
  it("renders the route list with total count and per-route summary", () => {
    render(<RoutesPanel {...baseProps()} />);

    expect(screen.getByText("1 total")).toBeInTheDocument();
    expect(screen.getByText("Ratna Park - Koteshwor")).toBeInTheDocument();
    expect(screen.getByText(/microbus.*12 stops/)).toBeInTheDocument();
  });

  it("shows a loading message only while loading and the list is still empty", () => {
    const { rerender } = render(
      <RoutesPanel {...baseProps({ routes: [], routesLoading: true, total: 0 })} />
    );
    expect(screen.getByText("Loading routes…")).toBeInTheDocument();

    rerender(<RoutesPanel {...baseProps({ routes: [makeRoute()], routesLoading: true })} />);
    expect(screen.queryByText("Loading routes…")).not.toBeInTheDocument();
  });

  it("shows a 'no routes match' message with the committed query, once loaded and empty", () => {
    render(
      <RoutesPanel {...baseProps({ routes: [], total: 0, searchQuery: "zzz", routesLoading: false })} />
    );
    expect(screen.getByText('No routes match "zzz".')).toBeInTheDocument();
  });

  it("only commits the search on submit, not on every keystroke", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    render(<RoutesPanel {...baseProps({ onSearchChange })} />);

    const input = screen.getByPlaceholderText("Search routes…");
    await user.type(input, "koteshwor");

    expect(onSearchChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("koteshwor");

    await user.click(screen.getByRole("button", { name: "Search routes" }));
    expect(onSearchChange).toHaveBeenCalledWith("koteshwor");
    expect(onSearchChange).toHaveBeenCalledTimes(1);
  });

  it("submits on Enter as well as the search button", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    render(<RoutesPanel {...baseProps({ onSearchChange })} />);

    await user.type(screen.getByPlaceholderText("Search routes…"), "ring road{Enter}");

    expect(onSearchChange).toHaveBeenCalledWith("ring road");
  });

  it("resets the draft query when searchQuery changes externally (e.g. parent clears it)", () => {
    const { rerender } = render(<RoutesPanel {...baseProps({ searchQuery: "koteshwor" })} />);
    const input = screen.getByPlaceholderText("Search routes…") as HTMLInputElement;
    expect(input.value).toBe("koteshwor");

    rerender(<RoutesPanel {...baseProps({ searchQuery: "" })} />);
    expect(input.value).toBe("");
  });

  it("toggles a route visible/hidden via the eye button and calls onToggleVisible with that route", async () => {
    const user = userEvent.setup();
    const route = makeRoute();
    const onToggleVisible = vi.fn();
    render(<RoutesPanel {...baseProps({ routes: [route], onToggleVisible })} />);

    const toggle = screen.getByRole("button", { name: `Show ${route.route_name} and its stops` });
    await user.click(toggle);

    expect(onToggleVisible).toHaveBeenCalledWith(route);
  });

  it("expands the visible route's stop list in ride order when visibleRouteId matches", () => {
    const route = makeRoute({ route_id: "R0001" });
    const stops: RouteStopEntry[] = [
      { sequence_no: 1, stop: { stop_id: "S0001", stop_name: "Ratna Park", lat: 27.7, lng: 85.3, is_major_stop: true, is_interchange: false, status: "active" } },
      { sequence_no: 2, stop: { stop_id: "S0002", stop_name: "Koteshwor", lat: 27.68, lng: 85.35, is_major_stop: false, is_interchange: true, status: "active" } },
    ];

    render(
      <RoutesPanel
        {...baseProps({ routes: [route], visibleRouteId: "R0001", visibleRouteStops: stops })}
      />
    );

    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Ratna Park");
    expect(items[1]).toHaveTextContent("Koteshwor");
  });

  it("shows a loading message instead of stops while the visible route's stops are loading", () => {
    render(
      <RoutesPanel
        {...baseProps({
          visibleRouteId: "R0001",
          visibleRouteStopsLoading: true,
          visibleRouteStops: [],
        })}
      />
    );
    expect(screen.getByText("Loading stops…")).toBeInTheDocument();
  });

  it("shows a 'Load more' button only when hasMore is true, and calls onLoadMore when clicked", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    const { rerender } = render(<RoutesPanel {...baseProps({ hasMore: false })} />);
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();

    rerender(<RoutesPanel {...baseProps({ hasMore: true, onLoadMore })} />);
    await user.click(screen.getByRole("button", { name: "Load more routes" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("disables the 'Load more' button and shows a loading label while loadingMore is true", () => {
    render(<RoutesPanel {...baseProps({ hasMore: true, loadingMore: true })} />);
    const button = screen.getByRole("button", { name: "Loading…" });
    expect(button).toBeDisabled();
  });
});
