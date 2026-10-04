import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Mic, Square, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AudioNote {
  id: string;
  createdAt: string;
  dataUrl: string;
  duration: number;
}

const STORAGE_KEY = 'haven.audioNotes';
const MAX_BYTES = 1_500_000; // ~1.5MB data URL — keep localStorage comfortable

function loadNotes(): AudioNote[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as AudioNote[];
  } catch {
    return [];
  }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function AudioJournal() {
  const [notes, setNotes] = useState<AudioNote[]>(loadNotes);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(
      () => setElapsed((Date.now() - startedAtRef.current) / 1000),
      250,
    );
    return () => window.clearInterval(t);
  }, [recording]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const duration = (Date.now() - startedAtRef.current) / 1000;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > MAX_BYTES) {
          toast('That recording is a bit long to keep — try a shorter one.');
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const note: AudioNote = {
            id: `a-${Date.now()}`,
            createdAt: new Date().toISOString(),
            dataUrl: String(reader.result),
            duration,
          };
          setNotes((prev) => {
            const next = [note, ...prev];
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch {
              toast('This device is out of space for recordings — the newest one was not kept.');
              return prev;
            }
            return next;
          });
        };
        reader.readAsDataURL(blob);
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsed(0);
      recorder.start();
      setRecording(true);
    } catch {
      toast('Microphone access was not allowed — recording needs your permission.');
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const deleteNote = (id: string) => {
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="mt-3 rounded-xl border border-dashed border-haven-border bg-haven-canvas/60 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          aria-pressed={recording}
          className={cn(
            'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ease-soft',
            recording
              ? 'bg-haven-danger text-white hover:opacity-90'
              : 'border border-haven-border bg-white text-haven-text hover:border-haven-primary/40 hover:text-haven-primary',
          )}
        >
          {recording ? (
            <>
              <Square size={14} strokeWidth={2} className="fill-current" />
              Stop · {formatDuration(elapsed)}
            </>
          ) : (
            <>
              <Mic size={15} strokeWidth={1.75} />
              Record instead
            </>
          )}
        </button>
        <p className="text-[13px] text-haven-text-muted">
          Don't feel like writing? Say it out loud. Your audio is saved only on this device — it is
          never uploaded anywhere else.
        </p>
      </div>

      <AnimatePresence initial={false}>
        {notes.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="mt-3 space-y-2 overflow-hidden"
          >
            {notes.map((note) => (
              <li
                key={note.id}
                className="flex items-center gap-3 rounded-lg border border-haven-border bg-white px-3 py-2"
              >
                <audio controls src={note.dataUrl} className="h-9 min-w-0 flex-1" />
                <span className="shrink-0 text-xs text-haven-text-muted">
                  {formatDuration(note.duration)}
                </span>
                <button
                  type="button"
                  onClick={() => deleteNote(note.id)}
                  aria-label="Delete recording"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-haven-text-muted transition-colors hover:bg-haven-danger-soft hover:text-haven-danger"
                >
                  <Trash2 size={14} strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
