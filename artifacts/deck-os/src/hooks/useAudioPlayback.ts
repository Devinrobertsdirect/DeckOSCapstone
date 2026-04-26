import { useState, useRef, useCallback } from "react";
import { attachAmplitudeAnalyser } from "@/components/AIFace";

export type PlaybackState = "idle" | "speaking";

export function useAudioPlayback() {
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speak = useCallback(async (base64Mp3: string): Promise<void> => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }

    return new Promise((resolve) => {
      const audio = new Audio(`data:audio/mpeg;base64,${base64Mp3}`);
      audioRef.current = audio;
      attachAmplitudeAnalyser(audio);
      setPlaybackState("speaking");

      const done = () => {
        setPlaybackState("idle");
        resolve();
      };

      audio.onended  = done;
      audio.onerror  = done;

      audio.play().catch(done);
    });
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setPlaybackState("idle");
  }, []);

  return { playbackState, speak, stop };
}
