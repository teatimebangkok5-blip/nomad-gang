"use client";

import { useState, useTransition } from "react";
import { buttonClass, inputClass } from "@/components/form";
import { searchGooglePlaces, type GooglePlaceResult } from "./actions";

// Search Google for the venue and pick it: links the venue to the Google place the app shows on its map,
// and fills in the check-in point (and the English name/address if they're empty).
export function GooglePlaceSearch({ onPick }: { onPick: (place: GooglePlaceResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GooglePlaceResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();

  function search() {
    setError(null);
    startSearch(async () => {
      const response = await searchGooglePlaces(query);
      setError(response.error ?? null);
      setResults(response.results ?? null);
    });
  }

  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
      <label htmlFor="google-search" className="mb-1 block text-sm font-medium text-ink-800">
        Find on Google Maps
      </label>
      <div className="flex gap-2">
        <input
          id="google-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              search();
            }
          }}
          placeholder="e.g. Sky Bar Lebua"
          className={inputClass}
        />
        <button type="button" onClick={search} disabled={searching || query.trim().length < 2} className={buttonClass("secondary", "shrink-0")}>
          {searching ? "Searching…" : "Search"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {results && results.length === 0 && <p className="mt-2 text-sm text-ink-600">No places found.</p>}
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
                <span className="block text-sm font-medium">{place.name}</span>
                <span className="block text-xs text-ink-600">{place.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {results && results.length > 0 && <p className="mt-1 text-right text-xs text-ink-500">Results from Google</p>}
    </div>
  );
}
