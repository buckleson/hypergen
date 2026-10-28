/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Whisper off the main thread: the model is loaded once per worker, on the
// GPU when WebGPU can take it, else on WASM, and each request is answered
// with Whisper's word chunks. Download progress is posted as it comes.

import { env, pipeline } from '@huggingface/transformers';

import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import type { WhisperChunk } from '@hypergen/dapi';

export interface WhisperRequest {
	id: number;
	samples: Float32Array;
}

export type WhisperResponse =
	| { id: number; progress: number }
	| { id: number; chunks: WhisperChunk[] }
	| { id: number; error: string };

const MODEL = 'onnx-community/whisper-base_timestamped';

// The WASM runtime is the one bundled with the app, not the CDN copy.
if (env.backends.onnx.wasm) delete env.backends.onnx.wasm.wasmPaths;

// The app's lib is the DOM's, so the worker scope is narrowed by hand.
const scope = self as unknown as {
	onmessage: ((event: MessageEvent<WhisperRequest>) => void) | null;
	postMessage(message: WhisperResponse): void;
};

let asr: Promise<AutomaticSpeechRecognitionPipeline> | undefined;

/** Progress of the download in flight goes to whichever request started it. */
let report = (_progress: number) => {};

function load(device: 'webgpu' | 'wasm'): Promise<AutomaticSpeechRecognitionPipeline> {
	return pipeline('automatic-speech-recognition', MODEL, {
		device,
		progress_callback: (info) => {
			if (info.status === 'progress_total') report(info.progress / 100);
		},
	}) as Promise<AutomaticSpeechRecognitionPipeline>;
}

scope.onmessage = async ({ data: { id, samples } }) => {
	try {
		report = (progress) => scope.postMessage({ id, progress });
		asr ??= load('webgpu').catch(() => load('wasm'));
		asr.catch(() => (asr = undefined));
		const output = await (await asr)(samples, { return_timestamps: 'word', chunk_length_s: 30 });
		const { chunks = [] } = Array.isArray(output) ? output[0]! : output;
		scope.postMessage({ id, chunks: chunks as WhisperChunk[] });
	} catch (error) {
		scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
	}
};
