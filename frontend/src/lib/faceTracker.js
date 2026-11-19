import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

let landmarkerPromise = null
let landmarkerInstance = null

/**
 * Initializes and returns the FaceLandmarker instance (singleton).
 * Falls back from GPU to CPU if WebGL is unavailable or fails.
 */
export async function getFaceLandmarker() {
  if (landmarkerInstance) return landmarkerInstance
  if (landmarkerPromise) return landmarkerPromise

  landmarkerPromise = (async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_CDN)

      // Try GPU first
      try {
        landmarkerInstance = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'GPU',
          },
          outputFaceBlendshapes: false,
          runningMode: 'VIDEO',
          numFaces: 3,
        })
        return landmarkerInstance
      } catch (gpuErr) {
        console.warn('MediaPipe GPU delegate init failed, falling back to CPU:', gpuErr)
        landmarkerInstance = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'CPU',
          },
          outputFaceBlendshapes: false,
          runningMode: 'VIDEO',
          numFaces: 3,
        })
        return landmarkerInstance
      }
    } catch (err) {
      console.error('Failed to load FaceLandmarker:', err)
      landmarkerPromise = null
      return null
    }
  })()

  return landmarkerPromise
}
