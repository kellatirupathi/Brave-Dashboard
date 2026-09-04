// Speech-to-text for free-text fields, on the Web Speech API.
//
// Students capture a lead standing in front of the client, often on a phone,
// and typing what was just said is the step most likely to be skipped or
// shortened. Dictation is a convenience over the textarea, never a replacement:
// the text lands in the same field and stays editable, so a failed or garbled
// recognition costs nothing.
//
// SUPPORT IS NOT UNIVERSAL. Chrome and Safari implement this behind a prefix;
// Firefox does not implement it at all. `supported` is false there and callers
// must simply not render the button — never block the field on it.
import { useCallback, useEffect, useRef, useState } from "react";

/** The slice of the spec we use. The DOM lib does not declare it. */
type SpeechRecognitionAlternativeLike = { transcript: string };
type SpeechRecognitionResultLike = {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    readonly length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type DictationState = "idle" | "listening" | "paused";

export type UseDictationResult = {
  /** False when the browser cannot do this at all — hide the control. */
  supported: boolean;
  state: DictationState;
  /** Words recognised but not yet finalised, for a live preview. */
  interim: string;
  start: () => void;
  /** Stop and keep everything committed so far. */
  stop: () => void;
  /** Hold the microphone without discarding what has been captured. */
  pause: () => void;
  resume: () => void;
  /** Stop and discard everything captured during this run. */
  cancel: () => void;
};

export function useDictation({
  onCommit,
  onCancel,
  lang = "en-IN",
}: {
  /** Called with each finalised chunk. Append it to the field. */
  onCommit: (text: string) => void;
  /** Called on cancel with everything committed during this run, to undo it. */
  onCancel?: (committedText: string) => void;
  lang?: string;
}): UseDictationResult {
  const [supported] = useState(() => getRecognitionCtor() != null);
  const [state, setState] = useState<DictationState>("idle");
  const [interim, setInterim] = useState("");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Everything committed during this run, so cancel can take it back out.
  const committedRef = useRef("");
  // Distinguishes "the engine stopped because we paused/cancelled" from "the
  // engine stopped on its own", which it does after a few seconds of silence.
  const intentRef = useRef<"none" | "pause" | "cancel" | "stop">("none");
  // Callbacks live in refs so the recognition handlers never go stale without
  // tearing down and rebuilding the engine mid-sentence.
  const onCommitRef = useRef(onCommit);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCommitRef.current = onCommit;
    onCancelRef.current = onCancel;
  }, [onCommit, onCancel]);

  const build = useCallback((): SpeechRecognitionLike | null => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return null;
    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          const chunk = text.trim();
          if (chunk) {
            committedRef.current = `${committedRef.current} ${chunk}`.trim();
            onCommitRef.current(chunk);
          }
        } else {
          pending += text;
        }
      }
      setInterim(pending.trim());
    };

    recognition.onerror = (event) => {
      // "no-speech" and "aborted" are ordinary and self-correcting; anything
      // else means the run is over.
      const error = event.error;
      if (error === "no-speech" || error === "aborted") return;
      intentRef.current = "stop";
      setState("idle");
      setInterim("");
    };

    recognition.onend = () => {
      const intent = intentRef.current;
      intentRef.current = "none";
      setInterim("");
      if (intent === "pause") {
        setState("paused");
        return;
      }
      // The engine also ends itself on a silence timeout. While the student
      // still believes it is listening, restart so a pause in the conversation
      // does not silently end the recording.
      if (intent === "none" && recognitionRef.current) {
        try {
          recognitionRef.current.start();
          return;
        } catch {
          // Already running, or refused — fall through and settle on idle.
        }
      }
      setState("idle");
    };

    return recognition;
  }, [lang]);

  const start = useCallback(() => {
    if (recognitionRef.current) return;
    const recognition = build();
    if (!recognition) return;
    recognitionRef.current = recognition;
    committedRef.current = "";
    intentRef.current = "none";
    try {
      recognition.start();
      setState("listening");
    } catch {
      recognitionRef.current = null;
      setState("idle");
    }
  }, [build]);

  const teardown = useCallback((intent: "pause" | "cancel" | "stop") => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    intentRef.current = intent;
    if (intent === "pause") {
      // Keep the instance so resume() can restart the same run.
      recognition.stop();
      return;
    }
    recognitionRef.current = null;
    // abort() drops any in-flight audio; stop() would still deliver it.
    if (intent === "cancel") recognition.abort();
    else recognition.stop();
  }, []);

  const stop = useCallback(() => {
    teardown("stop");
    setState("idle");
    setInterim("");
  }, [teardown]);

  const pause = useCallback(() => {
    teardown("pause");
  }, [teardown]);

  const resume = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      start();
      return;
    }
    intentRef.current = "none";
    try {
      recognition.start();
      setState("listening");
    } catch {
      setState("listening");
    }
  }, [start]);

  const cancel = useCallback(() => {
    const committed = committedRef.current;
    teardown("cancel");
    committedRef.current = "";
    setState("idle");
    setInterim("");
    if (committed) onCancelRef.current?.(committed);
  }, [teardown]);

  // Leaving the screen mid-recording must release the microphone.
  useEffect(() => {
    return () => {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (recognition) {
        intentRef.current = "cancel";
        try {
          recognition.abort();
        } catch {
          // Already gone.
        }
      }
    };
  }, []);

  return { supported, state, interim, start, stop, pause, resume, cancel };
}
