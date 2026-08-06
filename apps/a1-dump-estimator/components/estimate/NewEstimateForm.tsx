"use client";

import { useState, useTransition } from "react";
import { Button, Card, Field, inputClassName } from "@/components/ui";
import { LocationIcon, TrashIcon } from "@/components/icons";
import { PhotoUploader, type LocalPhoto } from "./PhotoUploader";
import { DEBRIS_CATEGORIES, DEBRIS_CATEGORY_LABELS, LOAD_SIZE_PRESETS } from "@/lib/estimator/labels";
import type { CrewSize, ManualItemEntry } from "@/lib/domain/estimate";
import type { DebrisCategory } from "@/lib/domain/facility";
import { createEstimateAction } from "@/app/new-estimate/actions";

type LocationStatus = "idle" | "locating" | "found" | "error";

export function NewEstimateForm() {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [crewSize, setCrewSize] = useState<CrewSize>(2);
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [items, setItems] = useState<ManualItemEntry[]>([]);
  const [newItemCategory, setNewItemCategory] = useState<DebrisCategory>("general_junk");
  const [newItemQuantity, setNewItemQuantity] = useState(1);
  const [volumeOverride, setVolumeOverride] = useState<number | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setLocationStatus("error");
      return;
    }
    setLocationStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocationStatus("found");
      },
      () => setLocationStatus("error"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { label: DEBRIS_CATEGORY_LABELS[newItemCategory], category: newItemCategory, quantity: newItemQuantity, estimatedWeightLbs: null },
    ]);
    setNewItemQuantity(1);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit() {
    setError(null);
    if (!customerName.trim() || !customerPhone.trim() || !address.trim()) {
      setError("Customer name, phone, and address are required.");
      return;
    }
    if (items.length === 0) {
      setError("Add at least one item type so the correct dump fee can be calculated.");
      return;
    }
    if (!coords) {
      setError('Tap "Use My Location" so we can find the closest dump and calculate travel.');
      return;
    }

    startTransition(async () => {
      await createEstimateAction({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        address: address.trim(),
        latitude: coords.lat,
        longitude: coords.lng,
        notes,
        manualItems: items,
        manualVolumeYardsOverride: volumeOverride,
        crewSize,
      });
    });
  }

  return (
    <div className="space-y-5 px-4 pt-5">
      <Card className="space-y-3">
        <h2 className="text-base font-bold text-brand-navy">Customer</h2>
        <Field label="Name">
          <input
            className={inputClassName}
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Jane Smith"
          />
        </Field>
        <Field label="Phone">
          <input
            className={inputClassName}
            type="tel"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="(503) 555-0100"
          />
        </Field>
        <Field label="Address">
          <input
            className={inputClassName}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, Portland, OR"
          />
        </Field>
        <button
          type="button"
          onClick={useMyLocation}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg border-2 border-brand-navy text-sm font-semibold text-brand-navy"
        >
          <LocationIcon className="h-5 w-5" />
          {locationStatus === "found"
            ? "Location captured"
            : locationStatus === "locating"
              ? "Finding you…"
              : "Use My Location"}
        </button>
        {locationStatus === "error" && (
          <p className="text-sm text-brand-danger">
            Couldn&apos;t get your location — check location permissions and try again.
          </p>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-base font-bold text-brand-navy">Photos</h2>
        <PhotoUploader photos={photos} onChange={setPhotos} />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-base font-bold text-brand-navy">Load size</h2>
        <p className="text-sm text-brand-slate">Optional — quickly size the truck load.</p>
        <div className="flex flex-wrap gap-2">
          {LOAD_SIZE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setVolumeOverride(volumeOverride === preset.yards ? null : preset.yards)}
              className={`min-h-[44px] rounded-full px-4 text-sm font-semibold ${
                volumeOverride === preset.yards
                  ? "bg-brand-orange text-white"
                  : "border border-slate-300 text-brand-navy"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-base font-bold text-brand-navy">Items</h2>
        <div className="flex gap-2">
          <select
            className={`${inputClassName} flex-1`}
            value={newItemCategory}
            onChange={(e) => setNewItemCategory(e.target.value as DebrisCategory)}
          >
            {DEBRIS_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {DEBRIS_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            className={`${inputClassName} w-20`}
            value={newItemQuantity}
            onChange={(e) => setNewItemQuantity(Math.max(1, Number(e.target.value)))}
          />
          <Button type="button" variant="secondary" onClick={addItem}>
            Add
          </Button>
        </div>

        {items.length > 0 && (
          <ul className="divide-y divide-slate-200">
            {items.map((item, index) => (
              <li key={`${item.category}-${index}`} className="flex items-center justify-between py-2">
                <span className="text-sm text-brand-navy">
                  {item.quantity}× {item.label}
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  aria-label="Remove item"
                  className="text-brand-danger"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-base font-bold text-brand-navy">Crew size</h2>
        <div className="flex gap-2">
          {([1, 2, 3, 4] as CrewSize[]).map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setCrewSize(size)}
              className={`min-h-[48px] flex-1 rounded-lg text-base font-semibold ${
                crewSize === size ? "bg-brand-navy text-white" : "border border-slate-300 text-brand-navy"
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-base font-bold text-brand-navy">Notes</h2>
        <textarea
          className={`${inputClassName} min-h-[80px]`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Access notes, special instructions…"
        />
      </Card>

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-medium text-brand-danger">{error}</p>
      )}

      <Button fullWidth onClick={handleSubmit} disabled={isPending}>
        {isPending ? "Calculating…" : "Calculate Estimate"}
      </Button>
    </div>
  );
}
