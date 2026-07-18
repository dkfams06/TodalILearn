import { createHash } from 'node:crypto'
import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'

export type MarkdownFile = {
  absolutePath: string
  relativePath: string
  fileName: string
  folderPath: string | null
}

export type MarkdownFileContents = MarkdownFile & {
  rawMarkdown: string
  contentHash: string
  fileModifiedAt: string
}

function normalizeRelativePath(value: string) {
  return value.split(path.sep).join('/')
}

export async function discoverMarkdownFiles(inputFolder: string) {
  if (!inputFolder.trim()) throw new Error('옵시디언 입력 폴더를 설정해 주세요.')

  const root = await realpath(path.resolve(inputFolder))
  const rootStat = await stat(root)
  if (!rootStat.isDirectory()) throw new Error('옵시디언 입력 경로가 폴더가 아닙니다.')

  const files: MarkdownFile[] = []

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name, 'ko'))

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const absolutePath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(absolutePath)
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.md') {
        const relativePath = normalizeRelativePath(path.relative(root, absolutePath))
        if (!relativePath || relativePath.startsWith('../') || path.isAbsolute(relativePath)) {
          throw new Error(`입력 폴더 밖의 파일은 동기화할 수 없습니다: ${entry.name}`)
        }

        const relativeFolder = normalizeRelativePath(path.dirname(relativePath))
        files.push({
          absolutePath,
          relativePath,
          fileName: entry.name,
          folderPath: relativeFolder === '.' ? null : relativeFolder,
        })
      }
    }
  }

  await walk(root)
  return files
}

export async function readMarkdownFile(file: MarkdownFile): Promise<MarkdownFileContents> {
  const bytes = await readFile(file.absolutePath)
  const fileStat = await stat(file.absolutePath)

  return {
    ...file,
    rawMarkdown: bytes.toString('utf8'),
    contentHash: createHash('sha256').update(bytes).digest('hex'),
    fileModifiedAt: fileStat.mtime.toISOString(),
  }
}
