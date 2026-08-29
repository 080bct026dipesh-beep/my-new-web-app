import { vi } from "vitest";

export interface MockMarker {
  kind: "marker" | "circleMarker";
  latlng: unknown;
  options: Record<string, unknown>;
  tooltip: { content: string; options?: unknown } | null;
  popup: string | null;
  handlers: Record<string, (() => void)[]>;
  removed: boolean;
}

export interface MockPolyline {
  points: unknown;
  options: Record<string, unknown>;
  popup: string | null;
}

export interface MockLayerGroup {
  layers: unknown[];
  addedToMap: boolean;
  removed: boolean;
}

export interface MockControl {
  options: Record<string, unknown>;
  div: HTMLElement | null;
  addedToMap: boolean;
  removed: boolean;
}

/** Reset before each test via `leafletState.reset()`. */
export const leafletState = {
  markers: [] as MockMarker[],
  polylines: [] as MockPolyline[],
  layerGroups: [] as MockLayerGroup[],
  controls: [] as MockControl[],
  mapInstances: [] as { fitBoundsCalls: unknown[][] }[],
  reset() {
    this.markers = [];
    this.polylines = [];
    this.layerGroups = [];
    this.controls = [];
    this.mapInstances = [];
  },
};

function makeMarker(kind: MockMarker["kind"], latlng: unknown, options: Record<string, unknown> = {}): MockMarker & Record<string, unknown> {
  const marker: MockMarker = {
    kind,
    latlng,
    options,
    tooltip: null,
    popup: null,
    handlers: {},
    removed: false,
  };
  leafletState.markers.push(marker);

  const api = {
    ...marker,
    bindTooltip: (content: string, tooltipOptions?: unknown) => {
      marker.tooltip = { content, options: tooltipOptions };
      return api;
    },
    bindPopup: (content: string) => {
      marker.popup = content;
      return api;
    },
    on: (event: string, handler: () => void) => {
      (marker.handlers[event] ??= []).push(handler);
      return api;
    },
    setStyle: (opts: Record<string, unknown>) => {
      Object.assign(marker.options, opts);
      return api;
    },
    addTo: () => api,
    remove: () => {
      marker.removed = true;
    },
  };
  return api;
}

export function createLeafletMock() {
  const mapApi = {
    setView: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    fitBounds: vi.fn(),
    addLayer: vi.fn(),
  };

  const L = {
    map: vi.fn(() => {
      leafletState.mapInstances.push({ fitBoundsCalls: [] });
      return mapApi;
    }),
    tileLayer: vi.fn(() => ({ addTo: vi.fn().mockReturnThis() })),
    layerGroup: vi.fn(() => {
      const group: MockLayerGroup = { layers: [], addedToMap: false, removed: false };
      leafletState.layerGroups.push(group);
      const api = {
        addTo: () => {
          group.addedToMap = true;
          return api;
        },
        addLayer: (layer: unknown) => {
          group.layers.push(layer);
          return api;
        },
        remove: () => {
          group.removed = true;
        },
      };
      return api;
    }),
    circleMarker: vi.fn((latlng: unknown, options: Record<string, unknown> = {}) =>
      makeMarker("circleMarker", latlng, options)
    ),
    marker: vi.fn((latlng: unknown, options: Record<string, unknown> = {}) =>
      makeMarker("marker", latlng, options)
    ),
    polyline: vi.fn((points: unknown, options: Record<string, unknown> = {}) => {
      const poly: MockPolyline = { points, options, popup: null };
      leafletState.polylines.push(poly);
      const api = {
        ...poly,
        bindPopup: (content: string) => {
          poly.popup = content;
          return api;
        },
        addTo: () => api,
      };
      return api;
    }),
    latLngBounds: vi.fn((points: unknown) => ({ __points: points })),
    divIcon: vi.fn((opts: Record<string, unknown>) => ({ __divIcon: true, ...opts })),
    DomUtil: {
      create: vi.fn((tag: string) => document.createElement(tag)),
    },
    Control: Object.assign(
      class {
        options: Record<string, unknown>;
        constructor(options: Record<string, unknown> = {}) {
          this.options = options;
        }
      },
      {
        extend: (proto: { onAdd: () => HTMLElement }) => {
          return class {
            options: Record<string, unknown>;
            control: MockControl;
            constructor(options: Record<string, unknown> = {}) {
              this.options = options;
              this.control = { options, div: null, addedToMap: false, removed: false };
              leafletState.controls.push(this.control);
            }
            addTo() {
              this.control.div = proto.onAdd();
              this.control.addedToMap = true;
              return this;
            }
            remove() {
              this.control.removed = true;
            }
          };
        },
      }
    ),
  };

  return { default: L, ...L };
}
