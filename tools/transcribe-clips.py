"""Trascrive le 13 clip audio con faster-whisper e salva i timestamp a livello
di parola (per il karaoke). Output: tools/_words.json
Uso: D:\\whisper_env\\Scripts\\python.exe tools\\transcribe-clips.py [modello]
"""
import json
import os
import sys

from faster_whisper import WhisperModel

AUDIO = os.path.join(os.path.dirname(__file__), '..', 'assets', 'audio')
OUT = os.path.join(os.path.dirname(__file__), '_words.json')

MODEL = sys.argv[1] if len(sys.argv) > 1 else 'small'

def main():
    ids = sorted(f[:-4] for f in os.listdir(AUDIO) if f.endswith('.m4a'))
    print('modello:', MODEL, '| clip:', len(ids))
    model = WhisperModel(MODEL, device='cpu', compute_type='int8')
    result = {}
    for i, aid in enumerate(ids):
        path = os.path.join(AUDIO, aid + '.m4a')
        print('[%d/%d] %s ...' % (i + 1, len(ids), aid), flush=True)
        segments, info = model.transcribe(
            path, language='it', word_timestamps=True,
            vad_filter=True, beam_size=5,
        )
        words = []
        text_parts = []
        segs = []
        for seg in segments:
            text_parts.append(seg.text.strip())
            segs.append([round(seg.start, 2), round(seg.end, 2), seg.text.strip()])
            for w in (seg.words or []):
                words.append([round(w.start, 2), round(w.end, 2), w.word.strip()])
        result[aid] = {'words': words, 'segments': segs, 'text': ' '.join(text_parts).strip()}
        print('    parole:', len(words), '| frasi:', len(segs), flush=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print('scritto', OUT)

if __name__ == '__main__':
    main()
