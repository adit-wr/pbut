
const LANG_KEY = 'photobu.lang'
const DARK_KEY = 'photobu.dark'

let currentLang = 'en'

const dict = {
  en: {
    'app.eyebrow': 'Web photobooth',
    'header.frames': 'Frames',
    'header.framesAria': 'Number of photos',
    'header.mode': 'Mode',
    'header.modeAria': 'Colour mode',
    'header.light': 'Light mode',
    'header.dark': 'Dark mode',
    'header.language': 'Language',
    'section.camera': 'Camera',
    'section.face': 'Face',
    'section.finish': 'Finish',
    'section.frame': 'Frame',
    'section.strip': 'Strip',
    'section.output': 'Output',
    'camera.meta': '{count} frames · {seconds}s',
    'camera.ready': 'Ready {n}',
    'camera.takeAgain': 'Take again',
    'camera.start': 'Start',
    'camera.capture': 'Capture',
    'camera.on': 'Camera on',
    'camera.off': 'Camera off',
    'camera.toggle': 'Camera',
    'camera.stateOn': 'ON',
    'camera.stateOff': 'OFF',
    'camera.turnOn': 'Turn the camera on to start',
    'camera.counting': '{count} photos · {seconds}s countdown',
    'camera.idle': '{count} photos · {seconds} second countdown each',
    'capture.error': 'Could not capture a photo — the camera may not be ready yet.',
    'stage.off': 'Camera off',
    'stage.offHint': 'Turn it on to start capturing.',
    'stage.turnOn': 'Turn camera on',
    'stage.unavailable': 'Camera unavailable',
    'stage.retry': 'Try again',
    'stage.live': 'Live',
    'stage.processing': 'Processing',
    'stage.thumbs': '{count} captured photos',
    'stage.thumbAlt': 'Photo {n}',
    'cam.denied': 'Camera permission was denied. Allow camera access in your browser and retry.',
    'cam.notFound': 'No camera device was found on this machine.',
    'cam.busy': 'Your camera is busy in another app. Close it and retry.',
    'cam.unknown': 'Could not open the camera ({name}).',
    'picker.arAria': 'AR face filters',
    'picker.arLabel': 'Face tracking',
    'picker.filterAria': 'Photo filters',
    'picker.filterLabel': 'Beauty finish',
    'picker.themeAria': 'Photo strip themes',
    'picker.themeLabel': 'Frame & motif',
    'strip.placeholderTitle': 'Strip',
    'strip.placeholder': 'Your strip will appear here',
    'strip.placeholderHint': 'Press start and pick 2 or 3 frames above',
    'strip.aria': 'Generated photo strip',
    'output.retry': 'Retry',
    'save.sending': 'Processing photo…',
    'save.success': 'Photo processed successfully!',
    'output.downloadTitle': 'Download your photo strip',
    'output.downloadLockedTitle': 'Download unlocks once processing completes',
    'output.download': 'Download',
    'output.newStrip': 'New strip',
    'output.locked': 'Download is locked — retry the process above.',
    'output.hint': 'Download unlocks once the strip is processed.',
    'footer.right': 'Web photobooth',
    'error.label': 'Error',
    'error.title': 'Something went wrong',
    'error.unknown': 'Unknown error',
    'error.reload': 'Reload',
    'api.cannotReach': 'Cannot reach the photo service. {hint}',
    'api.devHint': 'Make sure the backend is running on port 4000 (or open http://localhost:8080).',
    'api.prodHint': 'Check the service logs and try again.',
    'api.requestFailed': 'Request failed ({status})',
    'api.exportFailed': 'Could not export the photo strip.',
    'meta.title': 'Photobu · Web Photobooth',
    'meta.desc': 'Photobu — take 2 or 3 photos, get an instant photo strip.',
  },
  id: {
    'app.eyebrow': 'Fotobooth Web',
    'header.frames': 'Jumlah Foto',
    'header.framesAria': 'Jumlah foto',
    'header.mode': 'Mode',
    'header.modeAria': 'Mode warna',
    'header.light': 'Mode terang',
    'header.dark': 'Mode gelap',
    'header.language': 'Bahasa',
    'section.camera': 'Kamera',
    'section.face': 'Wajah',
    'section.finish': 'Finishing',
    'section.frame': 'Bingkai',
    'section.strip': 'Strip',
    'section.output': 'Hasil',
    'camera.meta': '{count} foto · {seconds} dtk',
    'camera.ready': 'Siap {n}',
    'camera.takeAgain': 'Ambil lagi',
    'camera.start': 'Mulai',
    'camera.capture': 'Capture',
    'camera.on': 'Kamera aktif',
    'camera.off': 'Kamera nonaktif',
    'camera.toggle': 'Kamera',
    'camera.stateOn': 'AKTIF',
    'camera.stateOff': 'MATI',
    'camera.turnOn': 'Nyalakan kamera untuk mulai',
    'camera.counting': '{count} foto · hitung mundur {seconds} dtk',
    'camera.idle': '{count} foto · hitung mundur {seconds} dtk tiap foto',
    'capture.error': 'Gagal mengambil foto — kamera mungkin belum siap.',
    'stage.off': 'Kamera nonaktif',
    'stage.offHint': 'Nyalakan untuk mulai mengambil foto.',
    'stage.turnOn': 'Nyalakan kamera',
    'stage.unavailable': 'Kamera tidak tersedia',
    'stage.retry': 'Coba lagi',
    'stage.live': 'Langsung',
    'stage.processing': 'Memproses',
    'stage.thumbs': '{count} foto tersimpan',
    'stage.thumbAlt': 'Foto {n}',
    'cam.denied': 'Izin kamera ditolak. Izinkan akses kamera di browser lalu coba lagi.',
    'cam.notFound': 'Kamera tidak ditemukan di perangkat ini.',
    'cam.busy': 'Kamera sedang dipakai aplikasi lain. Tutup lalu coba lagi.',
    'cam.unknown': 'Gagal membuka kamera ({name}).',
    'picker.arAria': 'Filter wajah AR',
    'picker.arLabel': 'Pelacakan wajah',
    'picker.filterAria': 'Filter foto',
    'picker.filterLabel': 'Finishing beauty',
    'picker.themeAria': 'Tema strip foto',
    'picker.themeLabel': 'Bingkai & motif',
    'strip.placeholderTitle': 'Strip',
    'strip.placeholder': 'Strip kamu akan muncul di sini',
    'strip.placeholderHint': 'Tekan mulai dan pilih 2 atau 3 foto di atas',
    'strip.aria': 'Strip foto yang dibuat',
    'output.retry': 'Coba lagi',
    'save.sending': 'Memproses foto…',
    'save.success': 'Foto berhasil diproses!',
    'output.downloadTitle': 'Unduh strip foto kamu',
    'output.downloadLockedTitle': 'Unduh aktif setelah foto selesai diproses',
    'output.download': 'Unduh',
    'output.newStrip': 'Strip baru',
    'output.locked': 'Unduh terkunci — coba lagi proses di atas.',
    'output.hint': 'Unduh aktif setelah strip selesai diproses.',
    'footer.right': 'Fotobooth Web',
    'error.label': 'Kesalahan',
    'error.title': 'Terjadi kesalahan',
    'error.unknown': 'Kesalahan tidak diketahui',
    'error.reload': 'Muat ulang',
    'api.cannotReach': 'Tidak dapat menghubungi layanan foto. {hint}',
    'api.devHint': 'Pastikan backend berjalan di port 4000 (atau buka http://localhost:8080).',
    'api.prodHint': 'Periksa log layanan lalu coba lagi.',
    'api.requestFailed': 'Permintaan gagal ({status})',
    'api.exportFailed': 'Gagal mengekspor strip foto.',
    'meta.title': 'Photobu · Fotobooth Web',
    'meta.desc': 'Photobu — ambil 2 atau 3 foto, dapatkan strip foto instan.',
  },
}

export function t(lang, key, vars) {
  const table = dict[lang] || dict.en
  let out = table[key] ?? dict.en[key] ?? key
  if (vars) {
    Object.keys(vars).forEach((k) => {
      out = out.split(`{${k}}`).join(String(vars[k]))
    })
  }
  return out
}

export function getLang() {
  return currentLang
}

export function readStoredLang() {
  try {
    return localStorage.getItem(LANG_KEY) === 'id' ? 'id' : 'en'
  } catch {
    return 'en'
  }
}

export function storeLang(lang) {
  currentLang = lang === 'id' ? 'id' : 'en'
  try {
    localStorage.setItem(LANG_KEY, currentLang)
  } catch {

  }
  return currentLang
}

export function readStoredDark() {
  try {
    return localStorage.getItem(DARK_KEY) === 'true'
  } catch {
    return false
  }
}

export function storeDark(dark) {
  try {
    localStorage.setItem(DARK_KEY, String(!!dark))
  } catch {

  }
}
