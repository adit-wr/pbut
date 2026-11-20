import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

let landmarkerPromise = null
let landmarkerInstance = null

/** True when the browser can actually create a WebGL context (needed by the GPU delegate). */
function hasWebGL() {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return false
    const lose = gl.getExtension('WEBGL_lose_context')
    lose?.loseContext()
    return true
  } catch {
    return false
  }
}

/**
 * Initializes and returns the FaceLandmarker instance (singleton).
 * Uses the GPU delegate when WebGL is available and transparently falls back
 * to the CPU delegate otherwise (e.g. software-rendered browsers).
 */
export async function getFaceLandmarker() {
  if (landmarkerInstance) return landmarkerInstance
  if (landmarkerPromise) return landmarkerPromise

  landmarkerPromise = (async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_CDN)

      const create = (delegate) =>
        FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          outputFaceBlendshapes: false,
          runningMode: 'VIDEO',
          numFaces: 3,
        })

      if (hasWebGL()) {
        try {
          landmarkerInstance = await create('GPU')
          return landmarkerInstance
        } catch {
          // Fall through to CPU below.
        }
      }

      landmarkerInstance = await create('CPU')
      return landmarkerInstance
    } catch (err) {
      console.error('Failed to load the face tracking model:', err)
      landmarkerPromise = null
      return null
    }
  })()

  return landmarkerPromise
}
