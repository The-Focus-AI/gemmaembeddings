export interface SyntheticAudioClip {
  id: string;
  title: string;
  groundTruthDescription: string;
  durationSec: number;
  wavBase64: string;
  audioDataUrl: string;
}

function encodeMonoPcmWav(
  seconds: number,
  sampleAt: (timeSec: number, sampleIdx: number) => number,
  sampleRate = 16000,
): Buffer {
  const numSamples = Math.floor(sampleRate * seconds);
  const dataBytes = numSamples * 2;
  const buf = Buffer.alloc(44 + dataBytes);

  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, sampleAt(i / sampleRate, i)));
    buf.writeInt16LE(Math.round(clamped * 26000), 44 + i * 2);
  }
  return buf;
}

/**
 * Generates deterministic 16kHz 16-bit PCM WAV clips for testing EmbeddingGemma 2's 300M audio encoder.
 * No text is passed with these clips during corpus indexing; only raw WAV bytes are embedded.
 */
export function buildSyntheticAudioClips(): SyntheticAudioClip[] {
  const durationSec = 2.4;

  // 1. Alternating high-low two-tone emergency alarm siren (960Hz / 1440Hz)
  const sirenBuf = encodeMonoPcmWav(durationSec, (t) => {
    const freq = Math.floor(t * 5) % 2 === 0 ? 960 : 1440;
    return Math.sin(2 * Math.PI * freq * t) * 0.88;
  });

  // 2. Low-pass filtered ocean surf / wind static swell
  let lpState = 0;
  const surfBuf = encodeMonoPcmWav(durationSec, (t, i) => {
    const pseudoWhite = (Math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1;
    lpState = 0.95 * lpState + 0.05 * (pseudoWhite * 2 - 1);
    return lpState * 3.0 * (0.55 + 0.45 * Math.sin(2 * Math.PI * 0.35 * t));
  });

  // 3. Ascending C-major musical bell chime arpeggio (C5 -> E5 -> G5 -> C6)
  const notes = [523.25, 659.25, 783.99, 1046.5];
  const chimeBuf = encodeMonoPcmWav(durationSec, (t) => {
    const noteIdx = Math.min(notes.length - 1, Math.floor(t / 0.6));
    const localT = t - noteIdx * 0.6;
    const envelope = Math.exp(-localT * 4.5);
    const freq = notes[noteIdx] ?? 523.25;
    return (
      (Math.sin(2 * Math.PI * freq * localT) * 0.7 +
        Math.sin(2 * Math.PI * freq * 2 * localT) * 0.3) *
      envelope
    );
  });

  const toClip = (
    id: string,
    title: string,
    groundTruthDescription: string,
    buf: Buffer,
  ): SyntheticAudioClip => {
    const wavBase64 = buf.toString("base64");
    return {
      id,
      title,
      groundTruthDescription,
      durationSec,
      wavBase64,
      audioDataUrl: `data:audio/wav;base64,${wavBase64}`,
    };
  };

  return [
    toClip(
      "audio-siren",
      "Audio Clip 01 (WAV Only)",
      "Loud alternating high-low emergency alarm siren signal",
      sirenBuf,
    ),
    toClip(
      "audio-surf",
      "Audio Clip 02 (WAV Only)",
      "Continuous rushing wind static and ocean surf waves noise",
      surfBuf,
    ),
    toClip(
      "audio-chime",
      "Audio Clip 03 (WAV Only)",
      "Ascending four-note C-major musical bell chime arpeggio",
      chimeBuf,
    ),
  ];
}
