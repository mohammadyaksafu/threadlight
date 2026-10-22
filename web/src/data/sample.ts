// The synthetic scenario lives in data/sample.json at the repository root so the Python engine,
// the tests and this app all read the same file.
import raw from "../../../data/sample.json";
import type { Data } from "@/engine";

export const SAMPLE: Data = raw as unknown as Data;

export const APPROVER = "Compliance Officer (synthetic)";
export const SIM_MIN = "2026-10-01";
export const SIM_MAX = "2027-01-31";
export const D1_ORIGINAL = SAMPLE.documents.find((d) => d.id === "D1")?.valid_until ?? SIM_MIN;
