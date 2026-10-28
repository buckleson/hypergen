/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Speech to word-timed transcript on this machine, with Whisper: no key, and
 * nothing leaves the machine; only the model is downloaded, once. The audio
 * is decoded here (decoding needs an audio context, which workers lack) and
 * recognized in a worker kept for the session, so the model loads once and
 * the editor never waits on it.
 */

import { whisperToTranscript } from '@hypergen/dapi';

import type { Transcript } from '@hypergen/dapi';
import type { WhisperRequest, WhisperResponse } from './whisper.worker';

const SAMPLE_RATE = 16_000;

let worker: Worker | undefined;
let nextId = 0;

/** `blob`'s audio at 16 kHz, its channels averaged to one. */
async function decode(blob: Blob): Promise<Float32Array> {
	const context = new OfflineAudioContext(1, 1, SAMPLE_RATE);
	const buffer = await context.decodeAudioData(await blob.arrayBuffer());
	const samples = new Float32Array(buffer.length);
	for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
		const data = buffer.getChannelData(channel);
		for (let i = 0; i < data.length; i++) samples[i]! += data[i]! / buffer.numberOfChannels;
	}
	return samples;
}

/**
 * `blob`'s speech as a transcript. `onProgress` hears the model download,
 * 0 to 1, the first time only. Aborting `signal` stops waiting for the
 * answer; the worker finishes the request and drops it.
 */
export async function transcribe(
	blob: Blob,
	{ signal, onProgress }: { signal?: AbortSignal; onProgress?: (progress: number) => void } = {},
): Promise<Transcript> {
	signal?.throwIfAborted();
	const samples = await decode(blob);
	signal?.throwIfAborted();
	// Taken before the samples are handed to the worker, which empties them here.
	const duration = samples.length / SAMPLE_RATE;

	worker ??= new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
	const current = worker;
	const id = nextId++;
	const chunks = await new Promise<Extract<WhisperResponse, { chunks: unknown }>['chunks']>((resolve, reject) => {
		const done = () => {
			current.removeEventListener('message', onMessage);
			current.removeEventListener('error', onError);
			signal?.removeEventListener('abort', onAbort);
		};
		const onMessage = ({ data }: MessageEvent<WhisperResponse>) => {
			if (data.id !== id) return;
			if ('progress' in data) return onProgress?.(data.progress);
			done();
			if ('error' in data) reject(new Error(data.error));
			else resolve(data.chunks);
		};
		const onError = (event: ErrorEvent) => {
			done();
			if (worker === current) worker = undefined;
			current.terminate();
			reject(new Error(event.message || 'The transcription worker failed'));
		};
		const onAbort = () => {
			done();
			reject(signal!.reason);
		};
		current.addEventListener('message', onMessage);
		current.addEventListener('error', onError);
		signal?.addEventListener('abort', onAbort);
		current.postMessage({ id, samples } satisfies WhisperRequest, [samples.buffer]);
	});
	return whisperToTranscript(chunks, duration);
}
