import { File, FileArchive, FileCode, FileSpreadsheet, FileText, Image, Music, Video } from 'lucide-react'
import { extOf } from '../lib/format.js'

const KINDS = [
  { exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'], icon: Image, tone: 'violet' },
  { exts: ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'ppt', 'pptx'], icon: FileText, tone: 'blue' },
  { exts: ['csv', 'xls', 'xlsx', 'json', 'sql'], icon: FileSpreadsheet, tone: 'green' },
  { exts: ['zip', 'rar', '7z', 'tar', 'gz'], icon: FileArchive, tone: 'amber' },
  { exts: ['js', 'jsx', 'ts', 'py', 'java', 'c', 'cpp', 'html', 'css', 'yaml', 'yml'], icon: FileCode, tone: 'slate' },
  { exts: ['mp3', 'wav', 'flac'], icon: Music, tone: 'rose' },
  { exts: ['mp4', 'mov', 'mkv', 'webm'], icon: Video, tone: 'rose' },
]

export default function FileIcon({ name, size = 18 }) {
  const ext = extOf(name)
  const kind = KINDS.find((k) => k.exts.includes(ext)) ?? { icon: File, tone: 'slate' }
  const Icon = kind.icon
  return (
    <span className={`file-icon tone-${kind.tone}`} aria-hidden="true">
      <Icon size={size} strokeWidth={1.8} />
    </span>
  )
}
