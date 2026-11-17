export function realtimeWebSocket(onRequest, output = {}) {
  return class RealtimeWebSocket {
    static instances = [];
    sent = [];
    closed = false;

    constructor(url, protocols) {
      this.url = url;
      this.protocols = protocols;
      this.constructor.instances.push(this);
      queueMicrotask(() => this.emit({ type: 'session.created', session: {
        audio: { output: { format: { type: 'audio/pcm', rate: 24000 }, voice: 'marin', speed: 1, ...output } }
      } }));
    }

    emit(data) { this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) }); }
    send(json) { const data = JSON.parse(json); this.sent.push(data); onRequest?.(this, data); }
    close() { this.closed = true; }

    complete(bytes = [1, 0, 2, 0], id = 'response_sample') {
      this.emit({ type: 'response.created', response: { id } });
      this.emit({ type: 'response.output_audio.delta', response_id: id, delta: btoa(String.fromCharCode(...bytes)) });
      this.emit({ type: 'response.output_audio.done', response_id: id });
      this.emit({ type: 'response.done', response: { id, status: 'completed' } });
    }
  };
}
