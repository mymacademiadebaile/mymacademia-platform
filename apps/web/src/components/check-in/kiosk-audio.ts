export type FeedbackKind = "SUCCESS" | "WARNING" | "ERROR";

/** Audio is unlocked by the initial touch, never by a successful-looking local prediction. */
export class KioskAudio {
  private context: AudioContext | undefined;
  private nodes: OscillatorNode[] = [];
  async unlock() {
    this.context ??= new AudioContext();
    await this.context.resume();
  }
  stop() {
    for (const node of this.nodes) { try { node.stop(); } catch { /* already ended */ } }
    this.nodes = [];
  }
  play(kind: FeedbackKind, enabled: boolean, volume: number) {
    this.stop();
    const context = this.context;
    if (!enabled || !context || context.state !== "running" || volume <= 0) return;
    const tones = kind === "SUCCESS" ? [660, 880] : kind === "WARNING" ? [520] : [310, 220];
    for (const [index, frequency] of tones.entries()) {
      const oscillator = context.createOscillator(), gain = context.createGain(), start = context.currentTime + index * 0.14;
      oscillator.frequency.value = frequency; oscillator.type = "sine";
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(Math.min(1, Math.max(0, volume)) * 0.18, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.13);
      oscillator.connect(gain); gain.connect(context.destination); oscillator.start(start); oscillator.stop(start + 0.14);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      this.nodes.push(oscillator);
    }
  }
  dispose() { this.stop(); void this.context?.close(); this.context = undefined; }
}
