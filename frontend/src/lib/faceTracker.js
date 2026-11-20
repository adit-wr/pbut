import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

const BASE = import.meta.env.BASE_URL || '/'
const WASM_PATH = `${BASE}mediapipe/wasm`
const MODEL_PATH = `${BASE}mediapipe/models/face_landmarker.task`

let landmarkerPromise = null
let landmarkerInstance = null

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

export async function getFaceLandmarker() {
  if (landmarkerInstance) return landmarkerInstance
  if (landmarkerPromise) return landmarkerPromise

  landmarkerPromise = (async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_PATH)

      const create = (delegate) =>
        FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_PATH, delegate },
          outputFaceBlendshapes: false,
          runningMode: 'VIDEO',
          numFaces: 3,
        })

      if (hasWebGL()) {
        try {
          landmarkerInstance = await create('GPU')
          return landmarkerInstance
        } catch {

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
