export interface CaptureState {
  video: HTMLVideoElement
  stream: MediaStream
}

export async function startCapture(video: HTMLVideoElement): Promise<CaptureState> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
    audio: false,
  })
  video.srcObject = stream
  await new Promise<void>((resolve) => {
    video.onloadedmetadata = () => resolve()
  })
  await video.play()
  return { video, stream }
}

export function stopCapture(state: CaptureState): void {
  state.stream.getTracks().forEach((t) => t.stop())
  state.video.srcObject = null
}
