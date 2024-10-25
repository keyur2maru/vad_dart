/**
 * Converts a Float32Array to a WAV file Blob.
 * @param {Float32Array} float32Array
 * @param {number} sampleRate
 * @returns {Blob}
 */
function float32ToWav(float32Array, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + float32Array.length * 2);
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + float32Array.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, 1, true);
  /* channel count */
  view.setUint16(22, 1, true); // Mono
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 2, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, float32Array.length * 2, true);

  // Write the PCM samples
  floatTo16BitPCM(view, 44, float32Array);

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function floatTo16BitPCM(view, offset, float32Array) {
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    s = s < 0 ? s * 0x8000 : s * 0x7FFF;
    view.setInt16(offset, s, true);
  }
}

function logMessage(message) {
  console.log(message);
}

let isListening = false;
let vadInstance = null;

function startListeningImpl(
  positiveSpeechThreshold,
  negativeSpeechThreshold,
  preSpeechPadFrames,
  redemptionFrames,
  frameSamples,
  minSpeechFrames,
  submitUserSpeechOnPause
) {
  if (isListening || vadInstance) return;

  isListening = true;
  // Initialize and start VAD service
  async function initializeVAD() {
    try {
      vadInstance = await vad.MicVAD.new({
        positiveSpeechThreshold,
        negativeSpeechThreshold,
        preSpeechPadFrames,
        redemptionFrames,
        frameSamples,
        minSpeechFrames,
        submitUserSpeechOnPause,
        onVADMisfire: () => {
          onVADMisfireCallback();
        },
        onSpeechStart: () => {
          onSpeechStartCallback();
        },
        onSpeechEnd: (audio) => {
          onSpeechEndCallback(audio);
        }
      });
      vadInstance.start();
    } catch (err) {
      onErrorCallback(err);
    }
  }
  initializeVAD();
}

function stopListening() {
  if (vadInstance) {
    vadInstance.pause();
    vadInstance.destroy();
    isListening = false;
    vadInstance = null;
  } else {
    onErrorCallback("VAD instance is not initialized");
  }
}

function isListeningNow() {
  return isListening;
}

const onErrorCallback = (error) => {
  if (typeof executeDartHandler === 'function') {
    if (error instanceof DOMException) {
      error = error.toString();
    }
    error = JSON.stringify({ error });
    executeDartHandler("onError", error);
  } else {
    console.error(error);
  }
};

const onSpeechEndCallback = (float32Array) => {
  const wavBlob = float32ToWav(float32Array);
  const reader = new FileReader();
  reader.onload = function(event) {
    const base64Wav = event.target.result.split(',')[1];
    const jsonData = JSON.stringify({ audioData: base64Wav });
    if (typeof executeDartHandler === 'function') {
      executeDartHandler("onSpeechEnd", jsonData);
    } else {
    onErrorCallback("executeDartHandler is not a function");
    }
  };
  reader.readAsDataURL(wavBlob);
};

const onSpeechStartCallback = () => {
  if (typeof executeDartHandler === 'function') {
    executeDartHandler("onSpeechStart", "");
  } else {
  onErrorCallback("executeDartHandler is not a function");
  }
};

const onVADMisfireCallback = () => {
  if (typeof executeDartHandler === 'function') {
    executeDartHandler("onVADMisfire", "");
  } else {
    onErrorCallback("executeDartHandler is not a function");
  }
};
