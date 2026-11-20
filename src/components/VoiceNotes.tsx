import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, Pause, Play, Send, Square, Trash2 } from "lucide-react";
import {
  MAX_VOICE_SECONDS, durationLabel, markListened, sendVoiceNote, startRecording, voiceNoteUrl,
  type Recorder, type VoiceRole,
} from "@/lib/voice";
import { useIncidentMessages } from "@/hooks/useOpsData";
import { clock } from "@/lib/ops";

type Props = {
  alertId: string;
  senderRole: VoiceRole;
  senderLabel?: string | null;
  /** Who the note is addressed to (`patient`, `responder`, `dispatcher`). */
  recipientRole: string;
  title?: string;
  className?: string;
};

type VoiceMessage = {
  id: string;
  kind?: string | null;
  media_path?: string | null;
  duration_seconds?: number | null;
  sender_role: string;
  sender_label: string | null;
  recipient_role: string;
  listened_at?: string | null;
  created_at: string;
};

export function VoiceNotes({ alertId, senderRole, senderLabel, recipientRole, title = "Voice notes", className = "" }: Props) {
  const messagesQ = useIncidentMessages(alertId, true);
  const notes = ((messagesQ.data ?? []) as unknown as VoiceMessage[]).filter((m) => m.kind === "voice" && m.media_path);

  const [recorder, setRecorder] = useState<Recorder | null>(null);
  const recorderRef = useRef<Recorder | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; recorderRef.current?.cancel(); }; }, []);
  const [elapsed, setElapsed] = useState(0);
  const [draft, setDraft] = useState<{ blob: Blob; seconds: number; url: string } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!recorder) return;
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [recorder]);

  useEffect(() => {
    if (recorder && elapsed >= MAX_VOICE_SECONDS) void stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, recorder]);

  useEffect(() => () => { if (draft) URL.revokeObjectURL(draft.url); }, [draft]);

  async function begin() {
    try {
      const r = await startRecording();
      if (!mounted.current) { r.cancel(); return; }
      recorderRef.current = r;
      setElapsed(0);
      setRecorder(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recording failed to start");
    }
  }

  async function stop() {
    if (!recorder) return;
    const r = recorder;
    recorderRef.current = null;
    setRecorder(null);
    const { blob, seconds } = await r.stop();
    if (mounted.current) setDraft({ blob, seconds, url: URL.createObjectURL(blob) });
  }

  function discard() {
    if (draft) URL.revokeObjectURL(draft.url);
    setDraft(null);
  }

  async function send() {
    if (!draft) return;
    setSending(true);
    try {
      await sendVoiceNote({
        alertId, blob: draft.blob, seconds: draft.seconds,
        senderRole, senderLabel: senderLabel ?? null, recipientRole,
      });
      discard();
      await messagesQ.refetch();
      toast.success("Voice note delivered");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Voice note failed to send");
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-label={title} className={`rounded-xl border border-border bg-card p-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">🎙️ {title}</p>
        {notes.length > 0 && <span className="text-[10px] text-muted-foreground">{notes.length} recorded</span>}
      </div>

      <ul className="mt-2 space-y-2">
        {notes.length === 0 && (
          <li className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            No voice notes yet.
          </li>
        )}
        {notes.map((n) => (
          <VoiceRow key={n.id} note={n} onPlayed={() => void messagesQ.refetch()} />
        ))}
      </ul>

      <div className="mt-3 space-y-2">
        {draft ? (
          <div className="space-y-2 rounded-lg border border-border p-2">
            <audio controls src={draft.url} className="w-full" aria-label="Preview your recording" />
            <div className="flex gap-2">
              <button
                type="button" onClick={send} disabled={sending}
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-emergency px-3 text-sm font-semibold text-emergency-foreground disabled:opacity-50"
              >
                <Send className="h-4 w-4" /> {sending ? "Sending…" : `Send ${durationLabel(draft.seconds)}`}
              </button>
              <button
                type="button" onClick={discard} disabled={sending}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
          </div>
        ) : recorder ? (
          <button
            type="button" onClick={() => void stop()}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-emergency px-3 text-sm font-semibold text-emergency-foreground"
          >
            <Square className="h-4 w-4" /> Stop recording · {durationLabel(elapsed)}
          </button>
        ) : (
          <button
            type="button" onClick={() => void begin()}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-3 text-sm font-semibold text-secondary-foreground"
          >
            <Mic className="h-4 w-4" /> Record voice note for {recipientRole}
          </button>
        )}
      </div>
    </section>
  );
}

function VoiceRow({ note, onPlayed }: { note: VoiceMessage; onPlayed: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLAudioElement | null>(null);
  const urlExpires = useRef(0);
  const marking = useRef(false);

  async function toggle() {
    if (playing) {
      ref.current?.pause();
      setPlaying(false);
      return;
    }
    try {
      setLoading(true);
      const cached = url && Date.now() < urlExpires.current;
      const src = cached ? url : await voiceNoteUrl(note.media_path!);
      if (!cached) urlExpires.current = Date.now() + 9 * 60_000;
      setUrl(src);
      setPlaying(true);

    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Playback failed");
    } finally {
      setLoading(false);
    }
  }

  async function heard() {
    if (note.listened_at || marking.current) return;
    marking.current = true;
    try { await markListened(note.id); onPlayed(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not update the playback receipt"); }
    finally { marking.current = false; }
  }

  useEffect(() => {
    if (playing) void ref.current?.play().catch(() => setPlaying(false));
  }, [playing, url]);

  return (
    <li className="rounded-lg border border-border p-2">
      <div className="flex items-center gap-2">
        <button
          type="button" onClick={() => void toggle()} disabled={loading}
          aria-label={playing ? "Pause voice note" : "Play voice note"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground disabled:opacity-50"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">
            {note.sender_label ?? note.sender_role} → {note.recipient_role}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {clock(note.created_at)} · {durationLabel(note.duration_seconds)} ·{" "}
            {note.listened_at ? "Listened" : "Delivered"}
          </p>
        </div>
        {!note.listened_at && <span className="h-2 w-2 shrink-0 rounded-full bg-emergency" aria-label="Unplayed" />}
      </div>
      {url && (
        <audio
          ref={ref} src={url} className="mt-2 w-full" controls
          onPlaying={() => void heard()}
          onError={() => { setPlaying(false); setUrl(null); urlExpires.current = 0; toast.error("Recording could not play. Try again to refresh the playback link."); }}
          onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)}
        />
      )}
    </li>
  );
}
