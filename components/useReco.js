"use client";
import { useMemo } from "react";
import { useApp } from "./AppContext";
import { recommend } from "../lib/engine/engine.mjs";

// The patient's ranked list, recomputed when the card, the reviews, the
// catalogue or the community counts change.
export function useReco(opts = {}) {
  const { me, catalog, reviews, stats } = useApp();
  const { allCategories = false, budgetHard } = opts;
  return useMemo(() => {
    if (!me || !me.card || !catalog || !catalog.products.length) return null;
    return recommend(me.card, reviews, catalog.products, { ctx: catalog.ctx, stats, allCategories, budgetHard });
  }, [me, catalog, reviews, stats, allCategories, budgetHard]);
}
