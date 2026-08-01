/**
 * sector-data.js
 * ------------------------------------------------------------------
 * UI-only copy for the sector picker: ids and display labels, nothing
 * else.
 *
 * Design decision: this intentionally duplicates the id/label pairs
 * from data/reference.js rather than fetching them from the backend.
 * The reason it's safe to duplicate here is *what* is duplicated: this
 * file has zero legal content (no citations, no recommendation text, no
 * stakes grounding). Those live in exactly one place, data/reference.js,
 * which only the server reads. If this list and the server's SECTORS
 * list ever drift, the worst case is a picker button with a stale
 * label, not an incorrect legal claim reaching a user, because no
 * legal claim is made here.
 * ------------------------------------------------------------------
 */

const SECTOR_OPTIONS = [
  { id: "technology-saas", label: "Technology / SaaS", stakesTier: "standard" },
  { id: "retail", label: "Retail", stakesTier: "standard" },
  { id: "financial-services", label: "Financial Services", stakesTier: "higher" },
  { id: "healthcare", label: "Healthcare", stakesTier: "higher" },
  { id: "manufacturing", label: "Manufacturing", stakesTier: "standard" },
  { id: "hospitality", label: "Hospitality", stakesTier: "standard" },
];
