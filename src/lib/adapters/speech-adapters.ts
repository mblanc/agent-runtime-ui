import {
  WebSpeechDictationAdapter,
  WebSpeechSynthesisAdapter,
} from "@assistant-ui/react";

export function createWebSpeechDictationAdapter(): WebSpeechDictationAdapter | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return new WebSpeechDictationAdapter();
  } catch {
    return undefined;
  }
}

export function createWebSpeechSynthesisAdapter(): WebSpeechSynthesisAdapter | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return new WebSpeechSynthesisAdapter();
  } catch {
    return undefined;
  }
}
