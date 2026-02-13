export class PcmAudioEngine {
  private context: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;

  private queue: Float32Array[] = [];
  private currentChunk: Float32Array | null = null;
  private currentIndex = 0;

  private readonly bufferSize = 2048;
  private readonly targetSampleRate = 48_000;

  async initFromUserGesture(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext({ sampleRate: this.targetSampleRate });
      this.processor = this.context.createScriptProcessor(this.bufferSize, 0, 2);
      this.analyser = this.context.createAnalyser();
      this.gain = this.context.createGain();

      this.analyser.fftSize = 2048;
      this.gain.gain.value = 0.95;

      this.processor.onaudioprocess = (event) => {
        const output = event.outputBuffer;
        const left = output.getChannelData(0);
        const right = output.getChannelData(1);

        for (let frame = 0; frame < output.length; frame += 1) {
          if (!this.currentChunk || this.currentIndex >= this.currentChunk.length - 1) {
            this.currentChunk = this.queue.shift() ?? null;
            this.currentIndex = 0;
          }

          if (!this.currentChunk) {
            left[frame] = 0;
            right[frame] = 0;
            continue;
          }

          left[frame] = this.currentChunk[this.currentIndex] ?? 0;
          right[frame] = this.currentChunk[this.currentIndex + 1] ?? left[frame];
          this.currentIndex += 2;
        }
      };

      this.processor.connect(this.gain);
      this.gain.connect(this.analyser);
      this.analyser.connect(this.context.destination);
    }

    if (this.context.state !== "running") {
      await this.context.resume();
    }
  }

  enqueuePcm16(chunk: ArrayBuffer): void {
    const int16 = new Int16Array(chunk);
    if (int16.length === 0) {
      return;
    }

    const floatInterleaved = new Float32Array(int16.length);
    for (let index = 0; index < int16.length; index += 1) {
      floatInterleaved[index] = int16[index] / 32768;
    }

    this.queue.push(floatInterleaved);

    if (this.queue.length > 120) {
      this.queue.splice(0, this.queue.length - 120);
    }
  }

  getFrequencyData(target: Uint8Array): void {
    if (!this.analyser) {
      target.fill(0);
      return;
    }
    this.analyser.getByteFrequencyData(target);
  }

  getQueueDepth(): number {
    return this.queue.length;
  }

  async close(): Promise<void> {
    this.queue = [];
    this.currentChunk = null;
    this.currentIndex = 0;

    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.gain) {
      this.gain.disconnect();
      this.gain = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
  }
}
