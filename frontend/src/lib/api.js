// API client for the Resilient Storage backend.
const TOKEN_KEY = 'rs_token'

export const auth = {
  get token() {
    try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
  },
  set token(v) {
    try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY) } catch { /* storage blocked */ }
  },
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function detailOf(j, fallback) {
  if (!j) return fallback
  if (typeof j.detail === 'string') return j.detail
  return j.detail?.[0]?.msg ?? fallback
}

function onUnauthorized() {
  if (auth.token) {
    auth.token = null
    window.dispatchEvent(new Event('rs:logout'))
  }
}

async function request(path, { method = 'GET', body, form, raw } = {}) {
  const headers = {}
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`
  let payload
  if (form) payload = form
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  let res
  try {
    res = await fetch(path, { method, headers, body: payload })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check that the backend is running.')
  }
  if (res.status === 401) onUnauthorized()
  if (!res.ok) {
    let j = null
    try { j = await res.json() } catch { /* not json */ }
    throw new ApiError(res.status, detailOf(j, res.statusText))
  }
  if (raw) return res
  if (res.status === 204) return null
  return res.json()
}

// XHR instead of fetch so the UI can show real upload progress.
function uploadWithProgress(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/files')
    if (auth.token) xhr.setRequestHeader('Authorization', `Bearer ${auth.token}`)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.upload.onload = () => onProgress(1)
    xhr.onload = () => {
      let j = null
      try { j = JSON.parse(xhr.responseText) } catch { /* empty */ }
      if (xhr.status === 401) onUnauthorized()
      if (xhr.status >= 200 && xhr.status < 300) resolve(j)
      else reject(new ApiError(xhr.status, detailOf(j, xhr.statusText)))
    }
    xhr.onerror = () => reject(new ApiError(0, 'Upload failed. Check your connection.'))
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}

export const api = {
  register: (username, password) => request('/api/auth/register', { method: 'POST', body: { username, password } }),
  login: async (username, password) => {
    const r = await request('/api/auth/login', { method: 'POST', form: new URLSearchParams({ username, password }) })
    auth.token = r.access_token
    return r
  },
  me: () => request('/api/auth/me'),
  users: () => request('/api/auth/users'),

  files: () => request('/api/files'),
  upload: uploadWithProgress,
  remove: (id) => request(`/api/files/${id}`, { method: 'DELETE' }),
  versions: (id) => request(`/api/files/${id}/versions`),
  restoreVersion: (id, v) => request(`/api/files/${id}/versions/${v}/restore`, { method: 'POST' }),
  download: async (id, name, version) => {
    const res = await request(`/api/files/${id}/download${version ? `?version=${version}` : ''}`, { raw: true })
    const url = URL.createObjectURL(await res.blob())
    const a = Object.assign(document.createElement('a'), { href: url, download: name })
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return res.headers.get('X-Content-SHA256')
  },

  stats: () => request('/api/admin/stats'),
  integrity: () => request('/api/recovery/integrity'),
  snapshots: () => request('/api/recovery/snapshots'),
  snapshot: () => request('/api/recovery/snapshots', { method: 'POST' }),
  restoreSnapshot: (id) => request(`/api/recovery/snapshots/${id}/restore`, { method: 'POST' }),
  disaster: (count, mode) => request(`/api/recovery/simulate-disaster?count=${count}&mode=${mode}`, { method: 'POST' }),
}
