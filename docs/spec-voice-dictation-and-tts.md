# Specification: Voice Dictation & Text-to-Speech (Web Speech API)

## 1. Executive Summary & Goals

This specification details the technical design for adding **Voice Dictation (STT)** and **Text-to-Speech Audio Readout (TTS)** to **Agent Runtime UI** using the zero-dependency, browser-native **Web Speech API** (Option 1).

- **Speech-to-Text (Dictation)**: Converts spoken user voice into text inside the composer input box using `window.SpeechRecognition` / `window.webkitSpeechRecognition`.
- **Text-to-Speech (Readout)**: Reads assistant response text aloud using `window.speechSynthesis`.

---

## 2. Component & Adapter Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          Gemini Composer                               │
│  [ Input Box ]    [ 🎙️ ComposerPrimitive.Dictate ] ──► DictationAdapter │
└────────────────────────────────────────────────────────────────────────┘
                                                            │
                                             (Native WebSpeech API)
                                                            │
┌───────────────────────────────────────────────────────────▼────────────┐
│                       Assistant Chat Message                           │
│  [ Response Text ] [ 🔊 ActionBarPrimitive.Speak ] ──► SpeechAdapter   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Frontend Implementation Blueprint

### 3.1 Dictation Adapter (`src/lib/gemini-runtime-adapter.ts`)

- Wire `@assistant-ui/react`'s built-in `WebSpeechDictationAdapter` into `useLocalRuntime` options:

```typescript
const runtime = useLocalRuntime(adapter, {
  dictationAdapter: new WebSpeechDictationAdapter(),
  speechSynthesisAdapter: new WebSpeechSynthesisAdapter(),
});
```

### 3.2 Composer Microphone Trigger (`src/components/assistant-ui/gemini-composer.tsx`)

- Replace the static `<button><Mic /></button>` element with `ComposerPrimitive.Dictate`:

```tsx
<ComposerPrimitive.Dictate className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#444746] transition-colors hover:bg-[#444746]/10 hover:text-[#1f1f1f] dark:text-[#c4c7c5] dark:hover:bg-[#c4c7c5]/10 dark:hover:text-[#e3e3e3] data-[dictating=true]:bg-rose-500/10 data-[dictating=true]:text-rose-500 animate-pulse">
  <Mic className="h-5 w-5" />
</ComposerPrimitive.Dictate>
```

### 3.3 Assistant Response Speaker Action (`src/components/assistant-ui/gemini-message.tsx`)

- Add `ActionBarPrimitive.Speak` and `ActionBarPrimitive.StopSpeaking` to `ActionBarPrimitive.Root`:

```tsx
<ActionBarPrimitive.Speak className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
  <Volume2 className="h-4 w-4" />
</ActionBarPrimitive.Speak>
```

---

## 4. Implementation Checklist

- [ ] **Task 1: Adapter Registration**
  - Register `WebSpeechDictationAdapter` and `WebSpeechSynthesisAdapter` in `src/lib/gemini-runtime-adapter.ts`.

- [ ] **Task 2: Composer Dictation Button**
  - Update `src/components/assistant-ui/gemini-composer.tsx` to use `ComposerPrimitive.Dictate`.

- [ ] **Task 3: Message Action Bar Speaker**
  - Update `src/components/assistant-ui/gemini-message.tsx` to include `ActionBarPrimitive.Speak`.

- [ ] **Task 4: Quality Gates**
  - Run `bun run preflight` to verify type checking, linting, and unit tests pass cleanly.
