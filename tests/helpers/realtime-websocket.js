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
    audio(event, responseId, fields = {}) {
      this.emit({ type: `response.output_audio.${event}`, response_id: responseId,
        item_id: 'sample-item', output_index: 0, content_index: 0, ...fields });
    }
    send(json) { const data = JSON.parse(json); this.sent.push(data); onRequest?.(this, data); }
    close() { this.closed = true; }

    complete(bytes = [1, 0, 2, 0], id = 'response_sample') {
      this.emit({ type: 'response.created', response: { id } });
      this.audio('delta', id, { delta: btoa(String.fromCharCode(...bytes)) });
      this.audio('done', id);
      this.emit({ type: 'response.done', response: { id, status: 'completed', output: [
        { id: 'sample-item', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_audio' }] }
      ] } });
    }
  };
}
