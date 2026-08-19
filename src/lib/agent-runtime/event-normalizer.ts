/**
 * Re-export barrel for the event normalisation modules.
 *
 * This file was 1341 lines holding four independent reasons to change: parsing
 * an untyped Vertex event, grouping turns, shaping thread messages, and the
 * shared utilities under all three. They only ever communicated through
 * AgentSessionEvent, so the split is a move rather than a rewrite.
 *
 * The barrel keeps the original import path valid for the twelve modules and
 * test files that use it, so the split is invisible to callers.
 */
export * from "./event-utils";
export * from "./group-turns";
export * from "./to-thread-messages";
export * from "./parse-event";
export * from "@/lib/artifacts/artifact-extractor";
