import { Readable } from 'node:stream';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { parseBuffer } from 'music-metadata';
import type { TranscriptionGateway } from '../../domain/repositories/transcription-gateway.ts';

ffmpeg.setFfmpegPath(ffmpegStatic);

const AUDIO_DURATION_LIMIT_SECONDS = 60;
const TELEGRAM_FILE_LIMIT_BYTES = 20 * 1024 * 1024;
const AUDIO_TYPES = new Set(['audio/wav', 'audio/ogg', 'audio/mpeg', 'audio/m4a', 'audio/x-m4a']);

type Fetcher = typeof fetch;

export class VoskTranscriptionGateway implements TranscriptionGateway {
  readonly #url: string | undefined;
  readonly #timeoutMs: number;
  readonly #fetch: Fetcher;

  constructor(url: string | undefined, timeoutMs: number, fetcher: Fetcher = fetch) {
    this.#url = url;
    this.#timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30_000;
    this.#fetch = fetcher;
  }

  async transcribe(input: { url: string; duration: number; mediaType: string; timeoutMs?: number }): Promise<string> {
    if (!this.#url) {
      throw new Error('VOSK_RECOGNIZE_URL is required for voice messages');
    }
    if (!Number.isFinite(input.duration) || input.duration <= 0 || input.duration > AUDIO_DURATION_LIMIT_SECONDS) {
      throw new Error(`Допустимая длительность аудио — до ${AUDIO_DURATION_LIMIT_SECONDS} секунд`);
    }
    if (!AUDIO_TYPES.has(input.mediaType)) {
      throw new Error(`Неподдерживаемый тип аудио: ${input.mediaType || 'unknown'}`);
    }
    const timeoutMs =
      typeof input.timeoutMs === 'number' && Number.isFinite(input.timeoutMs) && input.timeoutMs > 0
        ? input.timeoutMs
        : this.#timeoutMs;
    const signal = AbortSignal.timeout(timeoutMs);
    const response = await this.#fetch(input.url, { signal });
    if (!response.ok) {
      throw new Error(`Не удалось загрузить аудио: ${response.status}`);
    }
    const declaredSize = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > TELEGRAM_FILE_LIMIT_BYTES) {
      throw new Error('Размер аудио выходит за допустимый предел');
    }
    const mediaType = response.headers.get('content-type')?.split(';', 1)[0];
    if (!mediaType || !AUDIO_TYPES.has(mediaType)) {
      throw new Error(`Неподдерживаемый тип аудио: ${mediaType ?? 'unknown'}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > TELEGRAM_FILE_LIMIT_BYTES) {
      throw new Error('Размер аудио выходит за допустимый предел');
    }
    const metadata = await parseBuffer(buffer, mediaType, {
      duration: true,
      skipCovers: true,
      includeChapters: false,
    });
    const duration = metadata.format.duration;
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration > AUDIO_DURATION_LIMIT_SECONDS) {
      throw new Error(`Допустимая длительность аудио — до ${AUDIO_DURATION_LIMIT_SECONDS} секунд`);
    }
    const audio = metadata.format.container === 'WAVE' ? buffer : await convertAudio(buffer, signal);
    const formData = new FormData();
    formData.append('audio', new Blob([new Uint8Array(audio)], { type: 'audio/wav' }), 'audio.wav');
    const transcription = await this.#fetch(this.#url, {
      method: 'POST',
      body: formData,
      signal,
    });
    if (!transcription.ok) {
      throw new Error(`Ошибка сервиса распознавания: ${transcription.status}`);
    }
    const body = (await transcription.json()) as { text?: unknown };
    if (typeof body.text !== 'string') {
      throw new TypeError('Сервис распознавания вернул некорректный ответ');
    }
    return body.text;
  }
}

function convertAudio(inputBuffer: Buffer, signal: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const buffers: Buffer[] = [];
    let settled = false;
    const command = ffmpeg()
      .input(Readable.from(inputBuffer))
      .audioChannels(1)
      .audioBitrate('16k')
      .audioCodec('pcm_s16le')
      .format('wav');
    const finish = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = (): void => {
      command.kill('SIGKILL');
      finish(() => {
        reject(signal.reason);
      });
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    command
      .stream()
      .on('data', (chunk: Buffer) => {
        buffers.push(chunk);
      })
      .on('end', () => {
        finish(() => {
          resolve(Buffer.concat(buffers));
        });
      })
      .on('error', (error) => {
        finish(() => {
          reject(error);
        });
      });
  });
}
