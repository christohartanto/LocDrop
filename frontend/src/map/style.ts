// LocDrop's own map look ("daylight adventure"): grass-green land, cream roads, sky-blue water,
// chunky pale buildings, and NO text labels (like a game map). Data: OpenStreetMap via OpenFreeMap
// vector tiles (free, no key). Layer names follow the OpenMapTiles schema.

import type { StyleSpecification } from "maplibre-gl";

export const MAP_COLORS = {
  land: "#bfe8a0",
  green: "#a4dc86",
  park: "#93d678",
  sand: "#f6e7b0",
  water: "#79d2f5",
  building: "#f3f9e6",
  buildingSide: "#d9ecc4",
  roadCasing: "#8fc978",
  road: "#ffffff",
  roadMajor: "#fff3bf",
  path: "#fffbe6",
  rail: "#c9d6bd",
};

const C = MAP_COLORS;
const roadWidth = (min: number, max: number) => ["interpolate", ["exponential", 1.6], ["zoom"], 13, min, 19, max] as unknown as number;

export const adventureStyle: StyleSpecification = {
  version: 8,
  name: "LocDrop Adventure",
  sources: {
    world: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>',
    },
  },
  // Sky above the tilted map
  sky: {
    "sky-color": "#8fdcff",
    "horizon-color": "#e8fbff",
    "fog-color": "#e8fbff",
    "sky-horizon-blend": 0.6,
    "horizon-fog-blend": 0.6,
    "fog-ground-blend": 0.2,
  },
  layers: [
    { id: "land", type: "background", paint: { "background-color": C.land } },
    {
      id: "landcover-green",
      type: "fill",
      source: "world",
      "source-layer": "landcover",
      filter: ["in", ["get", "class"], ["literal", ["grass", "wood", "farmland", "wetland"]]],
      paint: { "fill-color": C.green },
    },
    {
      id: "landcover-sand",
      type: "fill",
      source: "world",
      "source-layer": "landcover",
      filter: ["==", ["get", "class"], "sand"],
      paint: { "fill-color": C.sand },
    },
    { id: "park", type: "fill", source: "world", "source-layer": "park", paint: { "fill-color": C.park } },
    {
      id: "landuse-green",
      type: "fill",
      source: "world",
      "source-layer": "landuse",
      filter: ["in", ["get", "class"], ["literal", ["pitch", "playground", "stadium", "cemetery", "garden"]]],
      paint: { "fill-color": C.park },
    },
    { id: "water", type: "fill", source: "world", "source-layer": "water", paint: { "fill-color": C.water } },
    {
      id: "waterway",
      type: "line",
      source: "world",
      "source-layer": "waterway",
      paint: { "line-color": C.water, "line-width": roadWidth(1, 8) },
      layout: { "line-cap": "round", "line-join": "round" },
    },
    {
      id: "rail",
      type: "line",
      source: "world",
      "source-layer": "transportation",
      filter: ["==", ["get", "class"], "rail"],
      paint: { "line-color": C.rail, "line-width": roadWidth(1, 5), "line-dasharray": [2, 2] },
    },
    {
      id: "road-casing",
      type: "line",
      source: "world",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"]]],
      paint: { "line-color": C.roadCasing, "line-width": roadWidth(3, 34) },
      layout: { "line-cap": "round", "line-join": "round" },
    },
    {
      id: "road-minor",
      type: "line",
      source: "world",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["tertiary", "minor", "service"]]],
      paint: { "line-color": C.road, "line-width": roadWidth(1.6, 26) },
      layout: { "line-cap": "round", "line-join": "round" },
    },
    {
      id: "road-major",
      type: "line",
      source: "world",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary"]]],
      paint: { "line-color": C.roadMajor, "line-width": roadWidth(2.4, 30) },
      layout: { "line-cap": "round", "line-join": "round" },
    },
    {
      id: "path",
      type: "line",
      source: "world",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["path", "track", "pedestrian"]]],
      paint: { "line-color": C.path, "line-width": roadWidth(1, 7), "line-dasharray": [1, 1.6] },
      layout: { "line-cap": "round", "line-join": "round" },
    },
    {
      id: "building",
      type: "fill-extrusion",
      source: "world",
      "source-layer": "building",
      minzoom: 14,
      paint: {
        "fill-extrusion-color": C.building,
        // squashed heights: a chunky toy-town look instead of realistic towers
        "fill-extrusion-height": ["min", 28, ["*", 0.45, ["coalesce", ["get", "render_height"], 8]]],
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.92,
        "fill-extrusion-vertical-gradient": true,
      },
    },
  ],
};
