"use client";

import { useState, useTransition } from "react";
import { buttonClass, inputClass } from "@/components/form";
import { searchPlaces, type PlaceResult } from "./actions";

const KIND_LABELS: Record<string, string> = {
  restaurant: "Restaurant",
  cafe: "Cafe",
  bar: "Bar",
  pub: "Pub",
  fast_food: "Fast food",
  food_court: "Food court",
  ice_cream: "Ice cream",
  bakery: "Bakery",
  coffee: "Coffee shop",
  tea: "Tea shop",
  temple: "Temple",
  park: "Park",
  garden: "Garden",
  market: "Market",
  mall: "Mall",
  museum: "Museum",
  gallery: "Gallery",
  attraction: "Attraction",
  viewpoint: "Viewpoint",
  cinema: "Cinema",
  theatre: "Theatre",
  zoo: "Zoo",
  theme_park: "Theme park",
};

// Find the venue among Bangkok's places (OpenStreetMap: food places and hangout places) and link it: the venue then
// replaces that place's dot on the app's map, and its check-in point and names are filled in when empty.
export function PlaceSearch({ onPick }: { onPick: (place: PlaceResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();

  function search() {
    setError(null);
    startSearch(async () => {
      const response = await searchPlaces(query);
      setError(response.error ?? null);
      setResults(response.results ?? null);
    });
  }

  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
      <label htmlFor="place-search" className="mb-1 block text-sm font-medium text-ink-800">
        Find the place on the map
      </label>
      <div className="flex gap-2">
        <input
          id="place-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              search();
            }
          }}
          placeholder="Name in English or Thai, e.g. Sky Bar"
          className={inputClass}
        />
        <button type="button" onClick={search} disabled={searching || query.trim().length < 2} className={buttonClass("secondary", "shrink-0")}>
          {searching ? "Searching…" : "Search"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {results && results.length === 0 && (
        <p className="mt-2 text-sm text-ink-600">
          Not found. You can still fill in the venue below; its check-in point puts it on the map.
        </p>
      )}
      {results && results.length > 0 && (
        <ul className="mt-2 divide-y divide-ink-200 rounded-lg border border-ink-200 bg-white">
          {results.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(place);
                  setResults(null);
                }}
                className="block w-full px-3 py-2 text-left hover:bg-ink-50"
              >
                <span className="block text-sm font-medium">
                  {place.name_en ?? place.name}
                  {place.name_th && place.name_th !== (place.name_en ?? place.name) && (
                    <span className="text-ink-500"> · {place.name_th}</span>
                  )}
                </span>
                <span className="block text-xs text-ink-600">
                  {KIND_LABELS[place.kind] ?? place.kind.replace(/_/g, " ")}
                  {place.purpose === "hangout" && " · hangout place"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-right text-xs text-ink-500">Places © OpenStreetMap contributors</p>
    </div>
  );
}
