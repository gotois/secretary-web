import test from 'ava';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const VOSK_HOST = process.env.VOSK_HOST || 'localhost';
const VOSK_PORT = process.env.VOSK_PORT || 2700;
const VOSK_URL = `http://${VOSK_HOST}:${VOSK_PORT}`;

const WAV_PATH = path.resolve(__dirname, 'fixtures/test-ru.wav');

/**
 * Создаёт FormData с тестовым WAV-файлом
 * @returns {FormData} Форма с аудиофайлом
 */
function makeFormData() {
  const buffer = readFileSync(WAV_PATH);
  const blob = new Blob([buffer], {
    type: 'audio/wav',
  });
  const form = new FormData();
  form.append('audio', blob, 'test-ru.wav');
  return form;
}

test('Vosk - Status HTTP correct', async (t) => {
  const response = await fetch(`${VOSK_URL}/recognize`, {
    method: 'POST',
    body: makeFormData(),
  });
  t.deepEqual(response.status, 200);
  const result = await response.json();
  t.assert(result !== undefined, 'Ответ не является JSON');
  t.assert(Object.hasOwn(result, 'text'), `Поле 'text' отсутствует в ответе: ${JSON.stringify(result)}`);
});

test('Vosk - Recognize text', async (t) => {
  const response = await fetch(`${VOSK_URL}/recognize`, {
    method: 'POST',
    body: makeFormData(),
  });
  const result = await response.json();
  t.deepEqual(typeof result.text, 'string');
  t.assert(
    result.text.trim().length > 0,
    `Модель не распознала речь в test-ru.wav. Полный ответ: ${JSON.stringify(result)}`,
  );
});

test('Vosk - No audio', async (t) => {
  const response = await fetch(`${VOSK_URL}/recognize`, {
    method: 'POST',
  });
  t.deepEqual(response.status, 400);
  const result = await response.json();
  t.assert(result !== undefined);
  t.assert(Object.hasOwn(result, 'error'), `Поле 'error' отсутствует в ответе: ${JSON.stringify(result)}`);
});
